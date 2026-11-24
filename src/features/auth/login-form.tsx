"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  signInWithPasswordAction,
  startGoogleOAuthAction,
  type PasswordSignInState,
} from "@/lib/supabase/actions";
import { safeNextPath } from "@/features/auth/safe-next";
import {
  getOAuthErrorMessage,
  type OAuthErrorCode,
} from "@/features/auth/oauth-errors";

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 48 48">
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.72 7.18l7.62 5.91c4.45-4.11 7.14-10.16 7.14-17.56Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.9-5.89l-7.62-5.91c-2.12 1.42-4.83 2.27-8.28 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.75-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.88.93 7.55 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
    </svg>
  );
}

function GoogleOAuthButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-token bg-surface-soft px-4 text-sm font-semibold text-text transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      <GoogleMark />
      {pending ? "Connecting to Google…" : "Continue with Google"}
    </button>
  );
}

export function LoginForm({
  nextPath,
  oauthError,
}: {
  nextPath: string;
  oauthError?: OAuthErrorCode;
}) {
  const initialState: PasswordSignInState = { error: null };
  const [state, passwordAction, pending] = useActionState(
    signInWithPasswordAction,
    initialState,
  );
  const passwordMessages = {
    "invalid-credentials":
      "We couldn’t sign you in. Check your email and password, then try again.",
    "invite-required":
      "This account does not have pixzer access. Sign in with an invited account or contact your administrator.",
    unavailable: "Sign-in is temporarily unavailable. Please try again later.",
  };
  const passwordError = state.error ? passwordMessages[state.error] : null;

  return (
    <div className="mt-7">
      {oauthError && (
        <p
          aria-live="polite"
          className="notice-error mb-4 text-sm"
          role="alert"
        >
          {getOAuthErrorMessage(oauthError)}
        </p>
      )}
      <form action={startGoogleOAuthAction}>
        <input name="next" type="hidden" value={safeNextPath(nextPath)} />
        <GoogleOAuthButton />
      </form>

      <div
        aria-label="or continue with email"
        className="my-6 flex items-center gap-3 text-xs font-medium text-muted"
        role="separator"
      >
        <span aria-hidden="true" className="h-px flex-1 bg-token" />
        <span>or continue with email</span>
        <span aria-hidden="true" className="h-px flex-1 bg-token" />
      </div>

      <form action={passwordAction} className="space-y-4">
        <input name="next" type="hidden" value={safeNextPath(nextPath)} />
        <label className="block text-sm text-text" htmlFor="login-email">
          Email address
          <input
            autoComplete="email"
            className="mt-2 h-12 w-full rounded-xl border border-token bg-surface-soft px-4 text-sm placeholder:text-subtle disabled:opacity-60"
            id="login-email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
            disabled={pending}
          />
        </label>
        <label className="block text-sm text-text" htmlFor="login-password">
          Password
          <input
            autoComplete="current-password"
            className="mt-2 h-12 w-full rounded-xl border border-token bg-surface-soft px-4 text-sm placeholder:text-subtle disabled:opacity-60"
            id="login-password"
            name="password"
            placeholder="Your password"
            required
            type="password"
            disabled={pending}
          />
        </label>
        <div className="text-right text-sm">
          <Link
            className="text-accent hover:text-[var(--accent-hover)]"
            href="/reset-password"
          >
            Forgot password?
          </Link>
        </div>
        {passwordError && (
          <p aria-live="polite" className="notice-error text-sm" role="alert">
            {passwordError}
          </p>
        )}
        <button
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent-hover)] disabled:cursor-wait disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
