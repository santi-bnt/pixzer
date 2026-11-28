import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { getGoogleDriveConfig, isGoogleDriveSelectedAndEnabled } from "@/lib/google-drive/server";
import { buildDriveAuthorizationUrl, createDriveOAuthParameters } from "@/lib/google-drive/oauth-flow.mjs";
import { consumeDriveRateLimit, driveRateLimitResponse } from "@/lib/google-drive/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=%2Flibrary", process.env.NEXT_PUBLIC_SITE_URL ?? "https://pixzer.vercel.app"));
  const config = getGoogleDriveConfig();
  if (!config || !isGoogleDriveSelectedAndEnabled()) {
    return NextResponse.redirect(new URL("/library?drive=unavailable", process.env.NEXT_PUBLIC_SITE_URL ?? "https://pixzer.vercel.app"));
  }
  const rateLimit = await consumeDriveRateLimit(user.id, "drive_oauth_start");
  const rateLimitFailure = driveRateLimitResponse(rateLimit);
  if (rateLimitFailure) return rateLimitFailure;

  const { state, verifier, challenge } = createDriveOAuthParameters();
  const forceConsent = new URL(request.url).searchParams.get("consent") === "1";
  const authorizationUrl = buildDriveAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    challenge,
    forceConsent,
  });
  const response = NextResponse.redirect(authorizationUrl);
  const secure = new URL(config.redirectUri).protocol === "https:";
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/api/drive/callback",
    maxAge: 600,
  };
  response.cookies.set("pixzer-drive-oauth-state", state, cookieOptions);
  response.cookies.set("pixzer-drive-oauth-verifier", verifier, cookieOptions);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
