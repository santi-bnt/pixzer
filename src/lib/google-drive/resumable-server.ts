import "server-only";

import { parseDriveUploadOffset } from "@/lib/google-drive/contracts.mjs";
import { decryptGoogleDriveSecret } from "@/lib/google-drive/server";
import { areDriveUploadsEnabled, getGoogleDriveConfig } from "@/lib/google-drive/server";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";

export type OwnedDriveUpload = {
  kind: "uploading";
  gameId: string;
  fileName: string;
  expectedSizeBytes: number;
  sessionUrl: string;
  expiresAt: string;
};

export type OwnedCompletedDriveUpload = {
  kind: "completed";
  gameId: string;
  driveFileId: string;
};

export type DriveUploadSessionStatus =
  | { kind: "incomplete"; offset: number }
  | { kind: "complete"; fileId: string }
  | { kind: "expired" }
  | { kind: "unavailable" };

/** Load a caller-owned upload session and keep its resumable URI server-side. */
export async function getOwnedDriveUpload(userId: string, uploadId: string): Promise<OwnedDriveUpload | OwnedCompletedDriveUpload | null> {
  if (!areDriveUploadsEnabled()) return null;
  const config = getGoogleDriveConfig();
  const supabase = createPrivilegedSupabaseClient();
  if (!config || !supabase) return null;

  const { data: session, error } = await supabase.from("drive_upload_sessions")
    .select("game_id, file_name, expected_size_bytes, drive_permission_id, status, expires_at, resumable_uri_ciphertext, resumable_uri_nonce, resumable_uri_tag")
    .eq("id", uploadId).eq("user_id", userId).maybeSingle();
  if (error || !session) return null;

  if (session.status === "completed") {
    const { data: game, error: gameError } = await supabase.from("games")
      .select("id, provider_file_id, storage_provider")
      .eq("id", session.game_id).eq("user_id", userId).maybeSingle();
    if (gameError || !game || game.storage_provider !== "google_drive" || !game.provider_file_id) return null;
    return { kind: "completed", gameId: game.id, driveFileId: game.provider_file_id };
  }

  if ((session.status !== "uploading" && session.status !== "pending") ||
      Date.parse(session.expires_at) <= Date.now() || !session.resumable_uri_ciphertext ||
      !session.resumable_uri_nonce || !session.resumable_uri_tag) return null;

  const { data: connection, error: connectionError } = await supabase.from("drive_connections")
    .select("drive_permission_id, refresh_token_ciphertext")
    .eq("user_id", userId).maybeSingle();
  if (connectionError || !connection?.refresh_token_ciphertext ||
      connection.drive_permission_id !== session.drive_permission_id) return null;

  try {
    const sessionUrl = decryptGoogleDriveSecret({
      version: 1,
      ciphertext: session.resumable_uri_ciphertext,
      nonce: session.resumable_uri_nonce,
      tag: session.resumable_uri_tag,
    }, config);
    const parsed = new URL(sessionUrl);
    if (parsed.origin !== "https://www.googleapis.com" || parsed.pathname !== "/upload/drive/v3/files") return null;
    return {
      kind: "uploading",
      gameId: session.game_id,
      fileName: session.file_name,
      expectedSizeBytes: Number(session.expected_size_bytes),
      sessionUrl,
      expiresAt: session.expires_at,
    };
  } catch {
    return null;
  }
}

/** Query Drive's resumable state server-side; its session URI is a bearer capability. */
export async function getDriveUploadSessionStatus(upload: OwnedDriveUpload): Promise<DriveUploadSessionStatus> {
  try {
    const response = await fetch(upload.sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes */${upload.expectedSizeBytes}` },
      cache: "no-store",
      redirect: "manual",
    });
    if (response.status === 404) return { kind: "expired" };
    if (response.status === 308) {
      if (response.headers.has("location")) return { kind: "unavailable" };
      const offset = parseDriveUploadOffset(response.headers.get("range"), upload.expectedSizeBytes);
      return offset === null ? { kind: "unavailable" } : { kind: "incomplete", offset };
    }
    if (response.status !== 200 && response.status !== 201) return { kind: "unavailable" };
    const value: unknown = await response.json().catch(() => null);
    if (typeof value !== "object" || value === null || Array.isArray(value) ||
        typeof (value as Record<string, unknown>).id !== "string") return { kind: "unavailable" };
    return { kind: "complete", fileId: (value as Record<string, string>).id };
  } catch {
    return { kind: "unavailable" };
  }
}
