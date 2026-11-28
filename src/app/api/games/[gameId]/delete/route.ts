import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { isOwnedDriveGameMetadata } from "@/lib/google-drive/contracts.mjs";
import {
  decryptRefreshToken,
  driveApiRequest,
  fetchDriveAbout,
  getGoogleDriveConfig,
  isGoogleDriveSelectedAndEnabled,
  refreshDriveAccessToken,
} from "@/lib/google-drive/server";
import { isJsonRequest, isSameOriginMutation } from "@/lib/r2/route-security";
import { consumeDriveRateLimit, driveRateLimitResponse } from "@/lib/google-drive/rate-limit";
import { isValidUploadId } from "@/lib/r2/upload-validation.mjs";

export const dynamic = "force-dynamic";

function privateJson(body: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  if (!isSameOriginMutation(request)) return privateJson({ error: "request-not-allowed" }, 403);
  if (!isJsonRequest(request)) return privateJson({ error: "invalid-request" }, 415);
  const user = await getAuthorizedUser();
  if (!user) return privateJson({ error: "invited-account-required" }, 401);
  if (!isGoogleDriveSelectedAndEnabled()) return privateJson({ error: "drive-storage-disabled" }, 503);

  const { gameId } = await context.params;
  if (!isValidUploadId(gameId)) return privateJson({ error: "game-unavailable" }, 404);
  const config = getGoogleDriveConfig();
  const admin = createPrivilegedSupabaseClient();
  if (!config || !admin) return privateJson({ error: "drive-storage-not-configured" }, 503);

  try {
    const sessionClient = await createClient();
    const { data: game, error: gameError } = await sessionClient.from("games")
      .select("id, user_id, title, file_name, size_bytes, storage_provider, provider_file_id, provider_account_id, provider_checksum")
      .eq("id", gameId).eq("user_id", user.id).maybeSingle();
    if (gameError || !game || game.user_id !== user.id) return privateJson({ error: "game-unavailable" }, 404);
    if (game.storage_provider !== "google_drive" || typeof game.provider_file_id !== "string" ||
        typeof game.provider_account_id !== "string" || typeof game.provider_checksum !== "string") {
      return privateJson({ error: "provider-delete-unavailable" }, 409);
    }

    const rateLimit = await consumeDriveRateLimit(user.id, "drive_delete");
    const rateLimitFailure = driveRateLimitResponse(rateLimit);
    if (rateLimitFailure) return rateLimitFailure;

    const { data: connection, error: connectionError } = await admin.from("drive_connections")
      .select("drive_permission_id, refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag")
      .eq("user_id", user.id).maybeSingle();
    if (connectionError || !connection?.refresh_token_ciphertext || !connection.refresh_token_nonce ||
        !connection.refresh_token_tag || connection.drive_permission_id !== game.provider_account_id) {
      return privateJson({ error: "drive-reauthorization-required" }, 409);
    }

    const refreshToken = decryptRefreshToken(connection, config.encryptionKey, config.previousEncryptionKey);
    const accessToken = await refreshDriveAccessToken(config, refreshToken);
    const about = await fetchDriveAbout(accessToken);
    if (about.permissionId !== game.provider_account_id) return privateJson({ error: "drive-reauthorization-required" }, 409);

    const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(game.provider_file_id)}`);
    metadataUrl.searchParams.set("fields", "id,name,size,md5Checksum,appProperties,trashed,owners(permissionId)");
    const metadataResponse = await driveApiRequest(accessToken, metadataUrl.toString());
    if (metadataResponse.status !== 404) {
      const metadata: unknown = await metadataResponse.json().catch(() => null);
      if (!metadataResponse.ok || !isOwnedDriveGameMetadata(metadata, {
        fileId: game.provider_file_id,
        fileName: game.file_name,
        sizeBytes: Number(game.size_bytes),
        gameId,
        permissionId: game.provider_account_id,
        providerChecksum: game.provider_checksum,
      })) return privateJson({ error: "drive-file-ownership-unverified" }, 409);

      const deleteResponse = await driveApiRequest(accessToken, metadataUrl.toString(), { method: "DELETE" });
      if (!deleteResponse.ok && deleteResponse.status !== 404) return privateJson({ error: "drive-file-delete-failed" }, 502);
    }

    const { error: deleteMetadataError } = await admin.from("games").delete()
      .eq("id", gameId).eq("user_id", user.id)
      .eq("storage_provider", "google_drive")
      .eq("provider_account_id", game.provider_account_id)
      .eq("provider_file_id", game.provider_file_id);
    if (deleteMetadataError) return privateJson({ error: "library-record-delete-failed" }, 503);
    return privateJson({ deleted: true });
  } catch {
    return privateJson({ error: "drive-file-delete-failed" }, 503);
  }
}
