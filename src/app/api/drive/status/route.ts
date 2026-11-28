import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { decryptRefreshToken, fetchDriveAbout, getGoogleDriveConfig, isGoogleDriveSelectedAndEnabled, refreshDriveAccessToken } from "@/lib/google-drive/server";
import { consumeDriveRateLimit, driveRateLimitResponse } from "@/lib/google-drive/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "invited-account-required" }, { status: 401 });
  const supabase = createPrivilegedSupabaseClient();
  const config = getGoogleDriveConfig();
  if (!supabase || !config || !isGoogleDriveSelectedAndEnabled()) {
    return NextResponse.json({ connected: false, configured: false }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const rateLimit = await consumeDriveRateLimit(user.id, "drive_status");
  const rateLimitFailure = driveRateLimitResponse(rateLimit);
  if (rateLimitFailure) return rateLimitFailure;

  const { data, error } = await supabase.from("drive_connections")
    .select("drive_permission_id, refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag")
    .eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "drive-status-unavailable" }, { status: 503 });
  if (!data?.refresh_token_ciphertext || !data.refresh_token_nonce || !data.refresh_token_tag) {
    return NextResponse.json({ connected: false, configured: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const refreshToken = decryptRefreshToken(data, config.encryptionKey, config.previousEncryptionKey);
    const accessToken = await refreshDriveAccessToken(config, refreshToken);
    const about = await fetchDriveAbout(accessToken);
    if (about.permissionId !== data.drive_permission_id) {
      return NextResponse.json({ connected: false, reauthorizationRequired: true }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({
      connected: true,
      storageLimitBytes: about.storageLimitBytes,
      storageUsedBytes: about.storageUsedBytes,
    }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ connected: false, reauthorizationRequired: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
