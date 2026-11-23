import Link from "next/link";
import { Brand, Notice } from "@/components/ui";
import {
  PasswordRecoveryRequestForm,
  PasswordUpdateForm,
} from "@/features/auth/password-recovery-forms";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { AppearanceSelect } from "@/features/appearance/theme-provider";

export default async function ResetPasswordPage() {
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
            Account recovery
          </div>
          <h1 className="mt-3 text-3xl font-semibold">
            {user ? "Choose a new password" : "Reset your password"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {user
              ? "Enter a new password for your pixzer account."
              : "We’ll send a secure reset link if an eligible account uses that email."}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted">
            This flow only restores account access; emulator gameplay is not
            available yet.
          </p>
          {user ? <PasswordUpdateForm /> : <PasswordRecoveryRequestForm />}
          <div className="mt-6">
            <Notice
              title="No game data changes here"
              body="Password recovery only affects account access. Your library and save data are separate."
            />
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          <Link href="/login" className="quiet-link">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
