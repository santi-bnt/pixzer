import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeAuthNextPath } from "@/features/auth/fragment-flow.mjs";
import { mapOAuthCodeExchangeError, mapOAuthProviderError } from "@/features/auth/oauth-error-flow.mjs";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>(["invite", "recovery"]);
const oauthNextCookie = "pixzer-oauth-next";

function redirectTo(request: NextRequest, pathname: string) {
  const response = NextResponse.redirect(new URL(pathname, request.url));
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(oauthNextCookie, "", {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/auth/confirm",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  if (!getSupabasePublicConfig()) {
    return redirectTo(request, "/login?error=auth-unavailable");
  }

  const url = request.nextUrl;
  if (url.searchParams.has("error") || url.searchParams.has("error_code")) {
    const error = mapOAuthProviderError(
      url.searchParams.get("error"),
      url.searchParams.get("error_code"),
    );
    return redirectTo(request, `/login?error=${error}`);
  }

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createClient();

  if (code) {
    const codeFlowNext =
      url.searchParams.get("type") === "recovery"
        ? "/reset-password"
        : url.searchParams.get("type") === "invite"
          ? "/register"
          : "/library";
    const next = getSafeAuthNextPath(
      url.searchParams.get("next") ??
        request.cookies.get(oauthNextCookie)?.value ??
        null,
      url.origin,
      codeFlowNext,
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const isOAuthCodeFlow = !url.searchParams.has("type");
      return redirectTo(request, isOAuthCodeFlow
        ? `/login?error=${mapOAuthCodeExchangeError(error.code ?? null)}`
        : "/login?error=invalid-link");
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.invited_at) {
      await supabase.auth.signOut();
      return redirectTo(request, "/login?error=invite-required");
    }

    return redirectTo(request, next);
  }

  if (tokenHash && type && allowedTypes.has(type as EmailOtpType)) {
    const next = getSafeAuthNextPath(
      url.searchParams.get("next"),
      url.origin,
      type === "invite" ? "/register" : "/reset-password",
    );
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) return redirectTo(request, "/login?error=invalid-link");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.invited_at) {
      await supabase.auth.signOut();
      return redirectTo(request, "/login?error=invite-required");
    }

    return redirectTo(request, next);
  }

  // Supabase's default ConfirmationURL redirects with tokens in the URL
  // fragment. Browsers do not send that fragment to this server route; a
  // redirect to the browser bridge preserves it without putting tokens in a
  // query string or server log.
  return redirectTo(request, "/auth/fragment");
}
