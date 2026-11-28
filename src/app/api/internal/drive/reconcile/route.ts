import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  classifyDriveReconciliationFiles,
  classifyDriveReconciliationProbe,
} from "@/lib/google-drive/reconciliation-contracts.mjs";
import { isDriveOwnedUploadMetadata } from "@/lib/google-drive/contracts.mjs";
import {
  decryptGoogleDriveSecret,
  decryptRefreshToken,
  driveApiRequest,
  fetchDriveAbout,
  getGoogleDriveConfig,
  refreshDriveAccessToken,
} from "@/lib/google-drive/server";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CleanupClaim = {
  cleanup_claim_id: string;
  upload_id: string;
  user_id: string;
  game_id: string;
  file_name: string;
  expected_size_bytes: number | string;
  cleanup_attempts: number;
  drive_permission_id: string;
  resumable_uri_ciphertext: string | null;
  resumable_uri_nonce: string | null;
  resumable_uri_tag: string | null;
};

type DriveFile = {
  id: string;
  name: string;
  size: string;
  md5Checksum: string;
  appProperties: Record<string, unknown>;
  trashed: boolean;
  owners: Array<{ permissionId?: string }>;
};

function isCleanupClaim(value: unknown): value is CleanupClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claim = value as Record<string, unknown>;
  return typeof claim.cleanup_claim_id === "string" && typeof claim.upload_id === "string" &&
    typeof claim.user_id === "string" && typeof claim.game_id === "string" &&
    typeof claim.file_name === "string" &&
    (typeof claim.expected_size_bytes === "number" || typeof claim.expected_size_bytes === "string") &&
    typeof claim.cleanup_attempts === "number" && typeof claim.drive_permission_id === "string" &&
    (claim.resumable_uri_ciphertext === null || typeof claim.resumable_uri_ciphertext === "string") &&
    (claim.resumable_uri_nonce === null || typeof claim.resumable_uri_nonce === "string") &&
    (claim.resumable_uri_tag === null || typeof claim.resumable_uri_tag === "string");
}

function isValidatedDriveFile(value: unknown, expected: {
  sizeBytes: number;
  fileName: string;
  gameId: string;
  permissionId: string;
}): value is DriveFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const file = value as Record<string, unknown>;
  return typeof file.id === "string" && typeof file.name === "string" &&
    typeof file.size === "string" && typeof file.md5Checksum === "string" &&
    typeof file.trashed === "boolean" && Array.isArray(file.owners) &&
    typeof file.appProperties === "object" && file.appProperties !== null &&
    isDriveOwnedUploadMetadata(file, expected);
}

function privateJson(body: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
  });
}

function isAuthorized(request: Request): boolean {
  const configured = process.env.PIXZER_DRIVE_RECONCILIATION_SECRET;
  const authorization = request.headers.get("authorization");
  if (!configured || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(configured);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function sessionUrlFromClaim(
  claim: CleanupClaim,
  config: NonNullable<ReturnType<typeof getGoogleDriveConfig>>,
): string | null {
  if (!claim.resumable_uri_ciphertext || !claim.resumable_uri_nonce || !claim.resumable_uri_tag) return null;
  const value = decryptGoogleDriveSecret({
    version: 1,
    ciphertext: claim.resumable_uri_ciphertext,
    nonce: claim.resumable_uri_nonce,
    tag: claim.resumable_uri_tag,
  }, config);
  const parsed = new URL(value);
  if (parsed.origin !== "https://www.googleapis.com" || !parsed.pathname.startsWith("/upload/drive/v3/files")) {
    throw new Error("invalid-resumable-session");
  }
  return parsed.toString();
}

async function fetchDriveFile(accessToken: string, fileId: string): Promise<unknown | null> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "id,name,size,md5Checksum,appProperties,trashed,owners(permissionId)");
  const response = await driveApiRequest(accessToken, url.toString());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "drive-auth-or-permission" : "drive-provider-error");
  return response.json().catch(() => null);
}

async function findDriveFiles(accessToken: string, gameId: string): Promise<unknown[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", `appProperties has { key='pixzerGameId' and value='${gameId}' } and (trashed = false or trashed = true)`);
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("fields", "files(id,name,size,md5Checksum,appProperties,trashed,owners(permissionId)),nextPageToken");
  const response = await driveApiRequest(accessToken, url.toString());
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "drive-auth-or-permission" : "drive-provider-error");
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("drive-provider-invalid-response");
  const record = value as Record<string, unknown>;
  if (record.nextPageToken || !Array.isArray(record.files) || record.files.length > 1) {
    throw new Error("drive-file-state-ambiguous");
  }
  return record.files;
}

async function deferClaim(
  supabase: NonNullable<ReturnType<typeof createPrivilegedSupabaseClient>>,
  claim: CleanupClaim,
  reason: "provider_temporary" | "provider_unavailable" | "authorization_revoked" | "ambiguous_file_state",
  manualReview: boolean,
): Promise<boolean> {
  const { error } = await supabase.rpc("defer_drive_upload_cleanup", {
    p_user_id: claim.user_id,
    p_upload_id: claim.upload_id,
    p_cleanup_claim_id: claim.cleanup_claim_id,
    p_reason: reason,
    p_retry_after_seconds: 86400,
    p_manual_review: manualReview,
  });
  return !error;
}

async function processClaim(
  supabase: NonNullable<ReturnType<typeof createPrivilegedSupabaseClient>>,
  config: NonNullable<ReturnType<typeof getGoogleDriveConfig>>,
  claim: CleanupClaim,
): Promise<"completed" | "released" | "deferred" | "manual"> {
  try {
    const { data: connection, error: connectionError } = await supabase.from("drive_connections")
      .select("drive_permission_id, refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag")
      .eq("user_id", claim.user_id).maybeSingle();
    if (connectionError || !connection?.refresh_token_ciphertext || !connection.refresh_token_nonce ||
        !connection.refresh_token_tag || connection.drive_permission_id !== claim.drive_permission_id) {
      await deferClaim(supabase, claim, "authorization_revoked", true);
      return "manual";
    }

    const accessToken = await refreshDriveAccessToken(config, decryptRefreshToken(connection, config.encryptionKey, config.previousEncryptionKey));
    const about = await fetchDriveAbout(accessToken);
    if (about.permissionId !== claim.drive_permission_id) {
      await deferClaim(supabase, claim, "ambiguous_file_state", true);
      return "manual";
    }

    let completedFileId: string | null = null;
    let uploadReportedComplete = false;
    const sessionUrl = sessionUrlFromClaim(claim, config);
    if (sessionUrl) {
      const probe = await driveApiRequest(accessToken, sessionUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes */${Number(claim.expected_size_bytes)}` },
      });
      const probeDecision = classifyDriveReconciliationProbe(probe.status, Number(claim.cleanup_attempts));
      if (probeDecision === "retry" || probeDecision === "manual_review") {
        const revoked = probe.status === 401 || probe.status === 403;
        const manual = probeDecision === "manual_review";
        await deferClaim(
          supabase,
          claim,
          revoked ? "authorization_revoked" : manual ? "ambiguous_file_state" : "provider_temporary",
          manual,
        );
        return manual ? "manual" : "deferred";
      }
      if (probeDecision === "verify_completed_file") {
        uploadReportedComplete = true;
        const value: unknown = await probe.json().catch(() => null);
        if (value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string") {
          completedFileId = (value as Record<string, string>).id;
        } else {
          await deferClaim(supabase, claim, "ambiguous_file_state", true);
          return "manual";
        }
      }
    }

    let candidates: unknown[];
    if (completedFileId) {
      const fetchedFile = await fetchDriveFile(accessToken, completedFileId);
      candidates = fetchedFile === null ? [] : [fetchedFile];
    } else {
      candidates = await findDriveFiles(accessToken, claim.game_id);
    }

    if (uploadReportedComplete && candidates.length === 0) {
      await deferClaim(supabase, claim, "ambiguous_file_state", true);
      return "manual";
    }

    const expected = {
      sizeBytes: Number(claim.expected_size_bytes),
      fileName: claim.file_name,
      gameId: claim.game_id,
      permissionId: claim.drive_permission_id,
    };
    const fileDecision = classifyDriveReconciliationFiles(candidates, expected, uploadReportedComplete);
    if (fileDecision === "confirmed_absent") {
      const { error } = await supabase.rpc("resolve_drive_upload_cleanup", {
        p_user_id: claim.user_id,
        p_upload_id: claim.upload_id,
        p_cleanup_claim_id: claim.cleanup_claim_id,
        p_resolution: "confirmed_absent",
      });
      return error ? "manual" : "released";
    }

    if (fileDecision === "confirmed_trashed") {
      const { error } = await supabase.rpc("resolve_drive_upload_cleanup", {
        p_user_id: claim.user_id,
        p_upload_id: claim.upload_id,
        p_cleanup_claim_id: claim.cleanup_claim_id,
        p_resolution: "confirmed_trashed",
      });
      return error ? "manual" : "released";
    }
    const candidateFile = candidates[0];
    if (fileDecision !== "verified_complete" || !isValidatedDriveFile(candidateFile, expected)) {
      await deferClaim(supabase, claim, "ambiguous_file_state", true);
      return "manual";
    }
    const file = candidateFile;

    const { error } = await supabase.rpc("complete_reconciled_drive_game_upload", {
      p_user_id: claim.user_id,
      p_upload_id: claim.upload_id,
      p_cleanup_claim_id: claim.cleanup_claim_id,
      p_drive_file_id: file.id,
      p_verified_size_bytes: Number(file.size),
      p_md5_checksum: file.md5Checksum.toLowerCase(),
    });
    return error ? "manual" : "completed";
  } catch (error) {
    const revoked = error instanceof Error && ["drive-auth-or-permission", "google-drive-authorization-revoked"].includes(error.message);
    const manual = revoked || Number(claim.cleanup_attempts) >= 3;
    const reason = revoked ? "authorization_revoked" : manual ? "ambiguous_file_state" : "provider_unavailable";
    await deferClaim(supabase, claim, reason, manual);
    return manual ? "manual" : "deferred";
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) return privateJson({ error: "not-authorized" }, 401);
  const config = getGoogleDriveConfig();
  const supabase = createPrivilegedSupabaseClient();
  if (!config || !supabase) return privateJson({ error: "reconciliation-not-configured" }, 503);

  const { data, error } = await supabase.rpc("claim_expired_drive_upload_cleanup", { p_batch_size: 3 });
  if (error || !Array.isArray(data) || !data.every(isCleanupClaim)) {
    return privateJson({ error: "reconciliation-unavailable" }, 503);
  }

  const counts = { claimed: data.length, completed: 0, released: 0, deferred: 0, manualReview: 0 };
  for (const claim of data) {
    const result = await processClaim(supabase, config, claim);
    if (result === "completed") counts.completed++;
    else if (result === "released") counts.released++;
    else if (result === "manual") counts.manualReview++;
    else counts.deferred++;
  }
  return privateJson(counts);
}
