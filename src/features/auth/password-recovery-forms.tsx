"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PasswordRecoveryRequestForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/confirm?next=%2Freset-password`,
        },
      );

      if (requestError) {
        setError(
          "We couldn’t send a reset link right now. Please try again later.",
        );
      } else {
        // Keep the response identical for known and unknown addresses.
        setMessage(
          "If an eligible account uses that email, a reset link will arrive shortly.",
        );
      }
    } catch {
      setError(
        "Password recovery is temporarily unavailable. Please try again later.",
      );
    }
    setPending(false);
  }

  return (
    <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm text-text" htmlFor="recovery-email">
        Email address
        <input
          autoComplete="email"
          className="mt-2 h-12 w-full rounded-xl border border-token bg-surface-soft px-4 text-sm placeholder:text-subtle disabled:opacity-60"
          id="recovery-email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
          disabled={pending}
        />
      </label>
      {message && (
        <p aria-live="polite" className="notice-success text-sm" role="status">
          {message}
        </p>
      )}
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
        {pending ? "Sending link…" : "Send reset link"}
      </button>
    </form>
  );
}

export function PasswordUpdateForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

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
          "We couldn’t update your password. Request a fresh reset link and try again.",
        );
        setPending(false);
        return;
      }

      setSuccess(true);
      setPending(false);
      router.refresh();
    } catch {
      setError(
        "Password recovery is temporarily unavailable. Please request a fresh link and try again.",
      );
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="mt-7 space-y-4">
        <p aria-live="polite" className="notice-success text-sm" role="status">
          Your password has been updated.
        </p>
        <button
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent-hover)]"
          onClick={() => router.replace("/library")}
          type="button"
        >
          Continue to library
        </button>
      </div>
    );
  }

  return (
    <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm text-text" htmlFor="new-password">
        New password
        <input
          autoComplete="new-password"
          className="mt-2 h-12 w-full rounded-xl border border-token bg-surface-soft px-4 text-sm placeholder:text-subtle disabled:opacity-60"
          id="new-password"
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
      <label className="block text-sm text-text" htmlFor="confirm-new-password">
        Confirm new password
        <input
          autoComplete="new-password"
          className="mt-2 h-12 w-full rounded-xl border border-token bg-surface-soft px-4 text-sm placeholder:text-subtle disabled:opacity-60"
          id="confirm-new-password"
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
        {pending ? "Updating password…" : "Update password"}
      </button>
    </form>
  );
}
