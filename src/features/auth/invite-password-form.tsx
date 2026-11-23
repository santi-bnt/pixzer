"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function InvitePasswordForm({ email }: { email: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError("Choose a password with at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Those passwords don’t match.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(
          "We couldn’t save that password. Please reopen your invitation or try again.",
        );
        setPending(false);
        return;
      }

      router.replace("/library");
      router.refresh();
    } catch {
      setError(
        "Account setup is temporarily unavailable. Please try again later.",
      );
      setPending(false);
    }
  }

  return (
    <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
      {email && (
        <p className="rounded-xl border border-token bg-surface-soft px-4 py-3 text-sm text-muted">
          Invitation for <span className="font-medium text-text">{email}</span>
        </p>
      )}
      <label className="block text-sm text-text" htmlFor="invite-password">
        Choose a password
        <input
          autoComplete="new-password"
          className="mt-2 h-12 w-full rounded-xl border border-token bg-surface-soft px-4 text-sm placeholder:text-subtle disabled:opacity-60"
          id="invite-password"
          minLength={12}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 12 characters"
          required
          type="password"
          value={password}
          disabled={pending}
        />
      </label>
      <label
        className="block text-sm text-text"
        htmlFor="invite-password-confirm"
      >
        Confirm password
        <input
          autoComplete="new-password"
          className="mt-2 h-12 w-full rounded-xl border border-token bg-surface-soft px-4 text-sm placeholder:text-subtle disabled:opacity-60"
          id="invite-password-confirm"
          name="confirmPassword"
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Enter it again"
          required
          type="password"
          value={confirmPassword}
          disabled={pending}
        />
      </label>
      {error && (
        <p aria-live="polite" className="notice-error text-sm" role="alert">
          {error}
        </p>
      )}
      <button
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent-hover)] disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving password…" : "Finish setting up account"}
      </button>
    </form>
  );
}
