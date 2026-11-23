import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>(["invite", "recovery"]);
const oauthNextCookie = "pixzer-oauth-next";

function safeNextPath(
  candidate: string | null,
  origin: string,
  fallback: string,
): string {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return fallback;
  }

  try {
    const decoded = decodeURIComponent(candidate);
    const parsed = new URL(candidate, origin);
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      parsed.origin !== origin
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

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
    return redirectTo(request, "/login?error=oauth-failed");
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
    const next = safeNextPath(
      url.searchParams.get("next") ??
        request.cookies.get(oauthNextCookie)?.value ??
        null,
      url.origin,
      codeFlowNext,
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
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

  if (tokenHash && type && allowedTypes.has(type as EmailOtpType)) {
    const next = safeNextPath(
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

  return redirectTo(request, "/login?error=invalid-link");
}
