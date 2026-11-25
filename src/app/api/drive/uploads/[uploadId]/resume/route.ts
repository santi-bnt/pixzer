import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { decryptDriveSecret } from "@/lib/google-drive/crypto.mjs";
import { getGoogleDriveConfig, isGoogleDriveSelectedAndEnabled } from "@/lib/google-drive/server";
import { isValidUploadId } from "@/lib/r2/upload-validation.mjs";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ uploadId: string }> }): Promise<Response> {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "invited-account-required" }, { status: 401 });
  const { uploadId } = await context.params;
  if (!isValidUploadId(uploadId)) return NextResponse.json({ error: "upload-unavailable" }, { status: 404 });
  const config = getGoogleDriveConfig();
  const supabase = createPrivilegedSupabaseClient();
  if (!config || !supabase || !isGoogleDriveSelectedAndEnabled()) {
    return NextResponse.json({ error: "drive-storage-not-configured" }, { status: 503 });
  }
  const { data, error } = await supabase.from("drive_upload_sessions")
    .select("game_id, file_name, expected_size_bytes, status, expires_at, resumable_uri_ciphertext, resumable_uri_nonce, resumable_uri_tag")
    .eq("id", uploadId).eq("user_id", user.id).maybeSingle();
  if (error || !data || (data.status !== "uploading" && data.status !== "pending") ||
      Date.parse(data.expires_at) <= Date.now() || !data.resumable_uri_ciphertext ||
      !data.resumable_uri_nonce || !data.resumable_uri_tag) {
    return NextResponse.json({ error: "upload-unavailable" }, { status: 404 });
  }
  try {
    const sessionUrl = decryptDriveSecret({
      version: 1,
      ciphertext: data.resumable_uri_ciphertext,
      nonce: data.resumable_uri_nonce,
      tag: data.resumable_uri_tag,
    }, config.encryptionKey);
    const parsed = new URL(sessionUrl);
    if (parsed.origin !== "https://www.googleapis.com" || !parsed.pathname.startsWith("/upload/drive/v3/files")) {
      return NextResponse.json({ error: "upload-unavailable" }, { status: 404 });
    }
    return NextResponse.json({
      uploadId,
      gameId: data.game_id,
      fileName: data.file_name,
      expectedSizeBytes: Number(data.expected_size_bytes),
      sessionUrl,
      expiresAt: data.expires_at,
      chunkSizeBytes: 8 * 1024 * 1024,
    }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ error: "upload-unavailable" }, { status: 404 });
  }
}
