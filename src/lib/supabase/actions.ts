"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPasswordSignInOutcome } from "@/features/auth/fragment-flow.mjs";
import { safeNextPath } from "@/features/auth/safe-next";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type PasswordSignInError =
  | "invalid-credentials"
  | "invite-required"
  | "unavailable";

export type PasswordSignInState = { error: PasswordSignInError | null };

export async function signInWithPasswordAction(
  _previousState: PasswordSignInState,
  formData: FormData,
): Promise<PasswordSignInState> {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  if (
    typeof emailValue !== "string" ||
    typeof passwordValue !== "string" ||
    !emailValue.trim() ||
    !passwordValue
  ) {
    return { error: "invalid-credentials" };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let nextPath: string;
  try {
    supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: emailValue.trim(),
      password: passwordValue,
    });
    if (error) return { error: "invalid-credentials" };

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    const outcome = getPasswordSignInOutcome({
      credentialsAccepted: true,
      userVerified: !userError && Boolean(user),
      invitedAt: user?.invited_at,
    });

    if (outcome !== "authenticated") {
      await supabase.auth.signOut();
      return { error: outcome };
    }

    const nextValue = formData.get("next");
    nextPath = safeNextPath(
      typeof nextValue === "string" ? nextValue : null,
    );
  } catch {
    return { error: "unavailable" };
  }

  redirect(nextPath);
}

function getSafeOrigin(originHeader: string | null): string | null {
  if (!originHeader) return null;

  try {
    const origin = new URL(originHeader);
    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    const isSecure = origin.protocol === "https:";
    const isLocalHttp =
      origin.protocol === "http:" && localHosts.has(origin.hostname);

    if (origin.username || origin.password || (!isSecure && !isLocalHttp)) {
      return null;
    }

    const configuredOrigins = [process.env.NEXT_PUBLIC_SITE_URL]
      .filter((value): value is string => Boolean(value))
      .map((value) => new URL(value).origin);
    if (process.env.VERCEL_URL) {
      configuredOrigins.push(
        new URL(`https://${process.env.VERCEL_URL}`).origin,
      );
    }

    const isConfigured = configuredOrigins.includes(origin.origin);
    const isLocalDevelopment = isLocalHttp && configuredOrigins.length === 0;
    return isConfigured || isLocalDevelopment ? origin.origin : null;
  } catch {
    return null;
  }
}

/** Start Google OAuth with the request-bound PKCE cookie and a fixed callback route. */
export async function startGoogleOAuthAction(
  formData: FormData,
): Promise<void> {
  const nextValue = formData.get("next");
  const nextPath = safeNextPath(
    typeof nextValue === "string" ? nextValue : null,
  );

  if (!getSupabasePublicConfig()) {
    redirect(
      `/login?error=google-unavailable&next=${encodeURIComponent(nextPath)}`,
    );
  }

  const requestHeaders = await headers();
  const origin = getSafeOrigin(requestHeaders.get("origin"));
  if (!origin) {
    redirect(
      `/login?error=google-unavailable&next=${encodeURIComponent(nextPath)}`,
    );
  }

  const callbackUrl = new URL("/auth/confirm", origin);

  let authorizationUrl: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
        skipBrowserRedirect: true,
      },
    });

    if (!error && data.url) {
      authorizationUrl = data.url;
    }
  } catch {
    // Return the same public error for provider and network failures.
  }

  if (!authorizationUrl) {
    redirect(
      `/login?error=google-unavailable&next=${encodeURIComponent(nextPath)}`,
    );
  }

  const cookieStore = await cookies();
  cookieStore.set("pixzer-oauth-next", nextPath, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/auth/confirm",
    maxAge: 600,
  });
  redirect(authorizationUrl);
}

export async function signOutAction(): Promise<void> {
  if (getSupabasePublicConfig()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error("Unable to end the current session.");
  }

  redirect("/login");
}
