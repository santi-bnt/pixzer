"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  completeAuthFragment,
  hasAuthFragment,
} from "@/features/auth/fragment-flow.mjs";
import { mapOAuthFragmentError } from "@/features/auth/oauth-error-flow.mjs";
import { createClient } from "@/lib/supabase/client";

type CallbackStatus = "verifying" | "invalid" | "unauthorized" | "unavailable";

const callbackPath = "/auth/fragment";

function navigateToError(error: string) {
  window.location.replace(`/login?error=${error}`);
}

export function AuthFragmentBridge() {
  const pathname = usePathname();
  const handled = useRef(false);
  const [status, setStatus] = useState<CallbackStatus>("verifying");
  const isCallbackPage = pathname === callbackPath;

  useEffect(() => {
    if (!isCallbackPage) {
      if (hasAuthFragment(window.location.hash)) {
        // URL fragments stay in the browser; the request to this path has no token.
        window.location.replace(`${callbackPath}${window.location.hash}`);
      }
      return;
    }

    if (handled.current) return;
    handled.current = true;

    const fragment = window.location.hash;
    window.history.replaceState(window.history.state, "", callbackPath);
    const oauthError = mapOAuthFragmentError(fragment);
    if (oauthError) {
      navigateToError(oauthError);
      return;
    }

    void (async () => {
      try {
        const supabase = createClient();
        const result = await completeAuthFragment(fragment, {
          setSession: (session) => supabase.auth.setSession(session),
          getUser: async () => {
            const {
              data: { user },
              error,
            } = await supabase.auth.getUser();
            return { user, error };
          },
          signOut: () => supabase.auth.signOut(),
        });

        if (result.status === "invalid") {
          setStatus("invalid");
          navigateToError("invalid-link");
          return;
        }
        if (result.status === "unavailable") {
          setStatus("unavailable");
          navigateToError("auth-unavailable");
          return;
        }
        if (result.status === "unauthorized") {
          setStatus("unauthorized");
          navigateToError("invite-required");
          return;
        }

        // A full navigation sends the newly written SSR cookies to the destination.
        window.location.replace(result.destination);
      } catch {
        setStatus("unavailable");
        navigateToError("auth-unavailable");
      }
    })();
  }, [isCallbackPage]);

  if (!isCallbackPage) return null;

  const message = {
    verifying: "Verifying your secure sign-in link…",
    invalid: "This sign-in link is invalid or expired.",
    unauthorized: "This account does not have an invitation.",
    unavailable: "Sign-in is temporarily unavailable. Please try again.",
  }[status];

  return (
    <main className="grid-glow grid min-h-screen place-items-center px-5 py-10">
      <p aria-live="polite" className="panel rounded-2xl px-6 py-5 text-sm">
        {message}
      </p>
    </main>
  );
}
