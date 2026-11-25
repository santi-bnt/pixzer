import Link from "next/link";
import { Brand } from "@/components/ui";
import { LoginForm } from "@/features/auth/login-form";
import { parseOAuthError } from "@/features/auth/oauth-error-flow.mjs";
import { safeNextPath } from "@/features/auth/safe-next";
import { AppearanceSelect } from "@/features/appearance/theme-provider";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const requestedNext = Array.isArray(params.next)
    ? params.next[0]
    : params.next;
  const requestedOAuthError = Array.isArray(params.error)
    ? params.error[0]
    : params.error;
  const nextPath = safeNextPath(requestedNext);
  const oauthError = parseOAuthError(requestedOAuthError);

  return (
    <main className="grid-glow grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" aria-label="pixzer home">
            <Brand />
          </Link>
          <AppearanceSelect compact />
        </div>
        <div className="panel mt-9 rounded-3xl p-7 sm:p-9">
          <div className="text-xs font-bold uppercase tracking-[.2em] text-accent">
            Welcome back
          </div>
          <h1 className="mt-3 text-3xl font-semibold">
            Sign in to your library
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Use the email address connected to your pixzer invitation.
          </p>
          <p className="mt-3 text-xs leading-5 text-muted">
            This signs you into your account. Game launching and emulator
            features are not available yet.
          </p>
          <LoginForm nextPath={nextPath} oauthError={oauthError} />
          <p className="mt-6 text-center text-sm text-muted">
            Need an invitation? Contact your pixzer administrator.
          </p>
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          <Link href="/" className="quiet-link">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
