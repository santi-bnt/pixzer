import Link from "next/link";
import { Brand, Notice } from "@/components/ui";
import { InvitePasswordForm } from "@/features/auth/invite-password-form";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { AppearanceSelect } from "@/features/appearance/theme-provider";

export default async function RegisterPage() {
  const user = await getAuthorizedUser();

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
            Invitation setup
          </div>
          <h1 className="mt-3 text-3xl font-semibold">
            {user ? "Finish setting up your account" : "pixzer is invite-only"}
          </h1>
          {user ? (
            <>
              <p className="mt-2 text-sm leading-6 text-muted">
                Choose a password for your invited account. This only updates
                your pixzer sign-in.
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                Account setup does not enable game uploads or emulator play.
              </p>
              <InvitePasswordForm email={user.email} />
            </>
          ) : (
            <div className="mt-6 space-y-5">
              <Notice
                title="An invitation is required"
                body="pixzer does not accept public registrations. Open the secure invitation link sent to your email to verify your address and finish account setup."
              />
              <p className="text-sm text-muted">
                Already accepted your invitation?{" "}
                <Link
                  className="text-accent hover:text-[var(--accent-hover)]"
                  href="/login"
                >
                  Sign in
                </Link>
              </p>
            </div>
          )}
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
