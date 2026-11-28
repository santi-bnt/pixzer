import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { DRIVE_UPLOAD_CHUNK_BYTES, selectPersistedDriveUploadCapability, validateDriveGameUpload } from "@/lib/google-drive/contracts.mjs";
import { decryptGoogleDriveSecret, decryptRefreshToken, driveApiRequest, getGoogleDriveConfig, areDriveUploadsEnabled, refreshDriveAccessToken } from "@/lib/google-drive/server";
import { encryptDriveSecret } from "@/lib/google-drive/crypto.mjs";
import { isJsonRequest, isSameOriginMutation } from "@/lib/r2/route-security";

export const dynamic = "force-dynamic";

function privateJson(value: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) return privateJson({ error: "request-not-allowed" }, 403);
  if (!isJsonRequest(request)) return privateJson({ error: "invalid-request" }, 415);
  const user = await getAuthorizedUser();
  if (!user) return privateJson({ error: "invited-account-required" }, 401);
  if (!areDriveUploadsEnabled()) return privateJson({ error: "drive-storage-disabled" }, 503);

  const config = getGoogleDriveConfig();
  const supabase = createPrivilegedSupabaseClient();
  if (!config || !supabase) return privateJson({ error: "drive-storage-not-configured" }, 503);
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return privateJson({ error: "invalid-request" }, 400);
  const record = body as Record<string, unknown>;
  const validated = validateDriveGameUpload(record);
  const idempotencyKey = record.idempotencyKey;
  if (!validated || typeof idempotencyKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return privateJson({ error: "invalid-upload-request" }, 400);
  }

  try {
    const { data: reservedData, error: reserveError } = await supabase.rpc("reserve_drive_game_upload", {
      p_user_id: user.id,
      p_idempotency_key: idempotencyKey.toLowerCase(),
      p_file_name: validated.fileName,
      p_title: validated.title,
      p_console: validated.console,
      p_expected_size_bytes: validated.sizeBytes,
    });
    if (reserveError) {
      if (reserveError.code === "23514") return privateJson({ error: "drive-quota-exceeded" }, 409);
      if (reserveError.code === "42501") return privateJson({ error: "invited-account-required" }, 401);
      if (reserveError.code === "55000") return privateJson({ error: "drive-not-connected" }, 409);
      if (reserveError.code === "22023") return privateJson({ error: "invalid-upload-request" }, 400);
      return privateJson({ error: "drive-reservation-failed" }, 503);
    }
    const row = Array.isArray(reservedData) ? reservedData[0] : reservedData;
    if (!row || typeof row.reserved_upload_id !== "string" || typeof row.reserved_game_id !== "string" ||
        typeof row.drive_permission_id !== "string" || typeof row.reserved_status !== "string") {
      return privateJson({ error: "drive-reservation-invalid" }, 503);
    }
    if (row.reserved_status === "completed") {
      return privateJson({ completed: true, gameId: row.reserved_game_id }, 200);
    }

    const { data: existing, error: existingError } = await supabase.from("drive_upload_sessions")
      .select("resumable_uri_ciphertext, resumable_uri_nonce, resumable_uri_tag, expires_at")
      .eq("id", row.reserved_upload_id).eq("user_id", user.id).maybeSingle();
    if (existingError || !existing || Date.parse(existing.expires_at) <= Date.now() ||
        (row.reserved_status !== "pending" && row.reserved_status !== "uploading")) {
      return privateJson({ error: "drive-upload-unavailable" }, 410);
    }
    let sessionUrl: string | null = null;
    if (existing?.resumable_uri_ciphertext && existing.resumable_uri_nonce && existing.resumable_uri_tag) {
      sessionUrl = decryptGoogleDriveSecret({
        version: 1,
        ciphertext: existing.resumable_uri_ciphertext,
        nonce: existing.resumable_uri_nonce,
        tag: existing.resumable_uri_tag,
      }, config);
    }
    if (!sessionUrl) {
      const { data: connection, error: connectionError } = await supabase.from("drive_connections")
        .select("drive_permission_id, refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag")
        .eq("user_id", user.id).maybeSingle();
      if (connectionError || !connection?.refresh_token_ciphertext || !connection.refresh_token_nonce ||
          !connection.refresh_token_tag || connection.drive_permission_id !== row.drive_permission_id) {
        return privateJson({ error: "drive-not-connected" }, 409);
      }
      const refreshToken = decryptRefreshToken(connection, config.encryptionKey, config.previousEncryptionKey);
      const accessToken = await refreshDriveAccessToken(config, refreshToken);
      const initUrl = new URL("https://www.googleapis.com/upload/drive/v3/files");
      initUrl.searchParams.set("uploadType", "resumable");
      initUrl.searchParams.set("fields", "id,name,size,mimeType,md5Checksum,appProperties,trashed");
      const response = await driveApiRequest(accessToken, initUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "application/octet-stream",
          "X-Upload-Content-Length": String(validated.sizeBytes),
        },
        body: JSON.stringify({
          name: validated.fileName,
          mimeType: "application/octet-stream",
          appProperties: { pixzerGameId: row.reserved_game_id },
        }),
      });
      if (!response.ok) return privateJson({ error: "drive-upload-session-failed" }, 502);
      const location = response.headers.get("location");
      if (!location) return privateJson({ error: "drive-upload-session-invalid" }, 502);
      const parsedLocation = new URL(location);
      if (parsedLocation.origin !== "https://www.googleapis.com" || !parsedLocation.pathname.startsWith("/upload/drive/v3/files")) {
        return privateJson({ error: "drive-upload-session-invalid" }, 502);
      }
      sessionUrl = location;
      const encrypted = encryptDriveSecret(location, config.encryptionKey);
      const { data: claimed, error: updateError } = await supabase.from("drive_upload_sessions").update({
        resumable_uri_ciphertext: encrypted.ciphertext,
        resumable_uri_nonce: encrypted.nonce,
        resumable_uri_tag: encrypted.tag,
        status: "uploading",
        updated_at: new Date().toISOString(),
      }).eq("id", row.reserved_upload_id).eq("user_id", user.id).eq("status", "pending")
        .is("resumable_uri_ciphertext", null)
        .select("resumable_uri_ciphertext, resumable_uri_nonce, resumable_uri_tag")
        .maybeSingle();
      if (updateError) return privateJson({ error: "drive-upload-session-save-failed" }, 503);
      if (claimed) {
        const storedCapability = selectPersistedDriveUploadCapability(
          { ...claimed, expires_at: existing.expires_at }, null,
        );
        if (!storedCapability) return privateJson({ error: "drive-upload-session-save-failed" }, 503);
        sessionUrl = decryptGoogleDriveSecret({ version: 1, ...storedCapability }, config);
      } else {
        // A concurrent retry may have won the reservation. Return only its
        // persisted capability; never expose this request's uncommitted URI.
        const { data: winner, error: winnerError } = await supabase.from("drive_upload_sessions")
          .select("resumable_uri_ciphertext, resumable_uri_nonce, resumable_uri_tag, status, expires_at")
          .eq("id", row.reserved_upload_id).eq("user_id", user.id).maybeSingle();
        const storedCapability = selectPersistedDriveUploadCapability(null, winner);
        if (winnerError || !storedCapability) {
          return privateJson({ error: "drive-upload-session-save-failed" }, 503);
        }
        sessionUrl = decryptGoogleDriveSecret({ version: 1, ...storedCapability }, config);
      }
    }

    return privateJson({
      completed: false,
      uploadId: row.reserved_upload_id,
      gameId: row.reserved_game_id,
      expiresAt: existing?.expires_at ?? row.reserved_expires_at,
      expectedSizeBytes: validated.sizeBytes,
      chunkSizeBytes: DRIVE_UPLOAD_CHUNK_BYTES,
    }, 201);
  } catch {
    return privateJson({ error: "drive-upload-unavailable" }, 503);
  }
}
