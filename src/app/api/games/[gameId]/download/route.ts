import { createGameDownloadUrl } from "@/lib/r2/storage-service";
import { createR2Client, getR2ServerConfig } from "@/lib/r2/server";
import { decryptRefreshToken, getGoogleDriveConfig, refreshDriveAccessToken } from "@/lib/google-drive/server";
import { isOwnedGameObjectKey, isValidUploadId } from "@/lib/r2/upload-validation.mjs";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { isOwnedDriveGameMetadata, parseSafeDriveMediaRedirect } from "@/lib/google-drive/contracts.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unavailable(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const user = await getAuthorizedUser();
  if (!user) return unavailable(401);
  const { gameId } = await context.params;
  if (!isValidUploadId(gameId)) return unavailable(404);

  try {
    const supabase = await createClient();
    const gameResult = await supabase.from("games")
      .select("id, user_id, file_name, object_key, storage_provider, provider_file_id, provider_account_id, provider_checksum, size_bytes")
      .eq("id", gameId).eq("user_id", user.id).maybeSingle();
    let data: {
      id: string; user_id: string; file_name: string; object_key: string; provider_checksum?: string | null;
      storage_provider: string; provider_file_id: string | null;
      provider_account_id: string | null; size_bytes: number;
    } | null = gameResult.data;
    let error: unknown = gameResult.error;
    if (gameResult.error) {
      const fallback = await supabase.from("games")
          .select("id, user_id, file_name, object_key, size_bytes")
        .eq("id", gameId).eq("user_id", user.id).maybeSingle();
      data = fallback.data ? { ...fallback.data, storage_provider: "r2", provider_file_id: null, provider_account_id: null } : null;
      error = fallback.error;
    }
    if (error || !data || data.user_id !== user.id) return unavailable(404);

    if (data.storage_provider === "google_drive") {
      if (process.env.PIXZER_GOOGLE_DRIVE_ENABLED !== "true" ||
          typeof data.provider_file_id !== "string" || typeof data.provider_account_id !== "string") return unavailable(503);
      const config = getGoogleDriveConfig();
      const admin = createPrivilegedSupabaseClient();
      if (!config || !admin) return unavailable(503);
      const { data: connection, error: connectionError } = await admin.from("drive_connections")
        .select("drive_permission_id, refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag")
        .eq("user_id", user.id).maybeSingle();
      if (connectionError || !connection?.refresh_token_ciphertext || !connection.refresh_token_nonce ||
          !connection.refresh_token_tag || connection.drive_permission_id !== data.provider_account_id) return unavailable(409);

      const refreshToken = decryptRefreshToken(connection, config.encryptionKey);
      const accessToken = await refreshDriveAccessToken(config, refreshToken);
      const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(data.provider_file_id)}`);
      metadataUrl.searchParams.set("fields", "id,name,size,md5Checksum,webContentLink,trashed,appProperties,owners(permissionId),capabilities(canDownload)");
      const metadataResponse = await fetch(metadataUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", redirect: "error",
      });
      const metadata: unknown = await metadataResponse.json().catch(() => null);
      if (!metadataResponse.ok || typeof metadata !== "object" || metadata === null) return unavailable(404);
      if (!isOwnedDriveGameMetadata(metadata, {
        sizeBytes: Number(data.size_bytes),
        fileName: data.file_name,
        gameId,
        permissionId: data.provider_account_id,
        fileId: data.provider_file_id,
        providerChecksum: data.provider_checksum ?? undefined,
        requireCanDownload: true,
      })) return unavailable(404);
      const record = metadata as Record<string, unknown>;
      const destination = parseSafeDriveMediaRedirect(
        typeof record.webContentLink === "string" ? record.webContentLink : null,
        metadataUrl.toString(),
      );
      if (!destination) return unavailable(502);
      // Google documents webContentLink for browser downloads of binary files.
      // The protected request validates the pixzer account first; ROM bytes
      // then travel from Drive to the browser, not through Vercel.
      return new Response(null, {
        status: 302,
        headers: {
          Location: destination.toString(),
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }

    const r2Config = getR2ServerConfig();
    if (!r2Config || process.env.PIXZER_R2_UPLOADS_ENABLED !== "true" || !isOwnedGameObjectKey(data.object_key, user.id)) {
      return unavailable(503);
    }
    const url = await createGameDownloadUrl(createR2Client(r2Config), r2Config, data.object_key, data.file_name);
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return unavailable(503);
  }
}
