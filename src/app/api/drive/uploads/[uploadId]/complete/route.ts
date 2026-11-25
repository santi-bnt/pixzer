import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { decryptRefreshToken, driveApiRequest, getGoogleDriveConfig, isGoogleDriveSelectedAndEnabled, refreshDriveAccessToken } from "@/lib/google-drive/server";
import { isDriveOwnedUploadMetadata } from "@/lib/google-drive/contracts.mjs";
import { isSameOriginMutation, isJsonRequest } from "@/lib/r2/route-security";
import { isValidUploadId } from "@/lib/r2/upload-validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ uploadId: string }> }): Promise<Response> {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "request-not-allowed" }, { status: 403 });
  if (!isJsonRequest(request)) return NextResponse.json({ error: "invalid-request" }, { status: 415 });
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "invited-account-required" }, { status: 401 });
  if (!isGoogleDriveSelectedAndEnabled()) return NextResponse.json({ error: "drive-storage-disabled" }, { status: 503 });
  const { uploadId } = await context.params;
  if (!isValidUploadId(uploadId)) return NextResponse.json({ error: "upload-unavailable" }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.driveFileId !== "string" || input.driveFileId.length < 1 || input.driveFileId.length > 256) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  const config = getGoogleDriveConfig();
  const supabase = createPrivilegedSupabaseClient();
  if (!config || !supabase) return NextResponse.json({ error: "drive-storage-not-configured" }, { status: 503 });
  try {
    const { data: session, error: sessionError } = await supabase.from("drive_upload_sessions")
      .select("game_id, file_name, expected_size_bytes, drive_permission_id, status, expires_at")
      .eq("id", uploadId).eq("user_id", user.id).maybeSingle();
    if (sessionError || !session) return NextResponse.json({ error: "upload-unavailable" }, { status: 404 });
    if (session.status === "completed") return NextResponse.json({ gameId: session.game_id, verified: true });
    if (session.status !== "uploading" || Date.parse(session.expires_at) <= Date.now()) {
      return NextResponse.json({ error: "upload-expired" }, { status: 410 });
    }

    const { data: connection, error: connectionError } = await supabase.from("drive_connections")
      .select("drive_permission_id, refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag")
      .eq("user_id", user.id).maybeSingle();
    if (connectionError || !connection?.refresh_token_ciphertext || !connection.refresh_token_nonce ||
        !connection.refresh_token_tag || connection.drive_permission_id !== session.drive_permission_id) {
      return NextResponse.json({ error: "drive-not-connected" }, { status: 409 });
    }
    const refreshToken = decryptRefreshToken(connection, config.encryptionKey);
    const accessToken = await refreshDriveAccessToken(config, refreshToken);
    const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.driveFileId)}`);
    metadataUrl.searchParams.set("fields", "id,name,size,mimeType,md5Checksum,appProperties,trashed,owners(permissionId)");
    const response = await driveApiRequest(accessToken, metadataUrl.toString());
    const file: unknown = await response.json().catch(() => null);
    if (!response.ok || !isDriveOwnedUploadMetadata(file, {
      sizeBytes: Number(session.expected_size_bytes),
      fileName: session.file_name,
      gameId: session.game_id,
      permissionId: session.drive_permission_id,
      fileId: input.driveFileId,
    })) {
      return NextResponse.json({ error: "drive-file-not-confirmed" }, { status: 409 });
    }
    const verifiedFile = file as Record<string, unknown>;

    const { data: completeResult, error: completeError } = await supabase.rpc("complete_drive_game_upload", {
      p_user_id: user.id,
      p_upload_id: uploadId,
      p_drive_file_id: input.driveFileId,
      p_verified_size_bytes: Number(session.expected_size_bytes),
      p_md5_checksum: String(verifiedFile.md5Checksum).toLowerCase(),
    });
    if (completeError) return NextResponse.json({ error: "drive-completion-unconfirmed" }, { status: 503 });
    const row = Array.isArray(completeResult) ? completeResult[0] : completeResult;
    if (!row || row.completed_game_id !== session.game_id || Number(row.completed_size_bytes) !== Number(session.expected_size_bytes)) {
      return NextResponse.json({ error: "drive-completion-unconfirmed" }, { status: 503 });
    }
    return NextResponse.json({ gameId: session.game_id, verified: true }, {
      headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch {
    return NextResponse.json({ error: "drive-completion-unconfirmed" }, { status: 503 });
  }
}
