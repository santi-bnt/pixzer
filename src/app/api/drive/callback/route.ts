import { NextRequest, NextResponse } from "next/server";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { GOOGLE_DRIVE_FILE_SCOPE } from "@/lib/google-drive/contracts.mjs";
import { equalOAuthState } from "@/lib/google-drive/oauth-flow.mjs";
import { decryptRefreshToken, encryptRefreshToken, exchangeDriveCode, fetchDriveAbout, getGoogleDriveConfig, isGoogleDriveSelectedAndEnabled, refreshDriveAccessToken, revokeDriveToken } from "@/lib/google-drive/server";

export const dynamic = "force-dynamic";

function returnToUpload(siteUrl: string, result: "connected" | "failed" | "consent-required"): NextResponse {
  const response = NextResponse.redirect(new URL(`/upload?drive=${result}`, siteUrl));
  const secure = siteUrl.startsWith("https://");
  for (const name of ["pixzer-drive-oauth-state", "pixzer-drive-oauth-verifier"]) {
    response.cookies.set(name, "", { httpOnly: true, secure, sameSite: "lax", path: "/api/drive/callback", maxAge: 0 });
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthorizedUser();
  const config = getGoogleDriveConfig();
  const siteUrl = config ? new URL(config.redirectUri).origin :
    (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://pixzer.vercel.app");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("pixzer-drive-oauth-state")?.value ?? null;
  const verifier = request.cookies.get("pixzer-drive-oauth-verifier")?.value;
  const code = request.nextUrl.searchParams.get("code");
  if (!user || !config || !isGoogleDriveSelectedAndEnabled() ||
      !equalOAuthState(expectedState, state) || !verifier || !code ||
      request.nextUrl.searchParams.has("error")) {
    return returnToUpload(siteUrl, "failed");
  }

  try {
    const supabase = createPrivilegedSupabaseClient();
    if (!supabase) return returnToUpload(siteUrl, "failed");
    const token = await exchangeDriveCode(config, code, verifier);
    const about = await fetchDriveAbout(token.access_token);
    const { data: previous } = await supabase
      .from("drive_connections")
      .select("drive_permission_id, refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag")
      .eq("user_id", user.id)
      .maybeSingle();

    if (previous?.drive_permission_id && previous.drive_permission_id !== about.permissionId) {
      const { count, error } = await supabase
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("storage_provider", "google_drive");
      const { count: activeUploadCount, error: uploadError } = await supabase
        .from("drive_upload_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["pending", "uploading"])
        .gt("expires_at", new Date().toISOString());
      if (error || uploadError || (count ?? 0) > 0 || (activeUploadCount ?? 0) > 0) {
        await revokeDriveToken(token.refresh_token ?? token.access_token);
        return returnToUpload(siteUrl, "failed");
      }
    }

    const sameDriveAccount = previous?.drive_permission_id === about.permissionId;
    const refreshToken = token.refresh_token ?? (sameDriveAccount && previous?.refresh_token_ciphertext &&
      previous.refresh_token_nonce && previous.refresh_token_tag
      ? decryptRefreshToken(previous, config.encryptionKey)
      : null);
    if (!refreshToken) {
      await revokeDriveToken(token.access_token);
      return returnToUpload(siteUrl, "consent-required");
    }

    const refreshedAccessToken = await refreshDriveAccessToken(config, refreshToken);
    const refreshedAbout = await fetchDriveAbout(refreshedAccessToken);
    if (refreshedAbout.permissionId !== about.permissionId) {
      await revokeDriveToken(token.refresh_token ?? token.access_token);
      return returnToUpload(siteUrl, "failed");
    }

    const encrypted = encryptRefreshToken(refreshToken, config.encryptionKey);
    const { error } = await supabase.from("drive_connections").upsert({
      user_id: user.id,
      drive_permission_id: about.permissionId,
      ...encrypted,
      token_key_version: 1,
      granted_scope: GOOGLE_DRIVE_FILE_SCOPE,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) {
      if (token.refresh_token) await revokeDriveToken(token.refresh_token);
      return returnToUpload(siteUrl, "failed");
    }

    if (previous?.drive_permission_id && previous.drive_permission_id !== about.permissionId &&
        previous.refresh_token_ciphertext && previous.refresh_token_nonce && previous.refresh_token_tag) {
      try {
        await revokeDriveToken(decryptRefreshToken(previous, config.encryptionKey));
      } catch {
        // The new connection is saved; a stale prior grant can be revoked in Google's account settings.
      }
    }

    return returnToUpload(siteUrl, "connected");
  } catch {
    return returnToUpload(siteUrl, "failed");
  }
}
