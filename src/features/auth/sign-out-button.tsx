"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError("Couldn’t sign out. Please try again.");
        setPending(false);
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Sign-out is temporarily unavailable. Please try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        className="text-xs text-accent hover:text-[var(--accent-hover)] disabled:opacity-60"
        disabled={pending}
        onClick={handleSignOut}
        type="button"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <span
          aria-live="polite"
          className="text-xs text-[var(--danger)]"
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}
