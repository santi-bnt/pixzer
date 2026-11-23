"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="text-xs font-bold uppercase tracking-[.25em] text-accent">
          Something went wrong
        </div>
        <h1 className="mt-3 text-3xl font-semibold">
          We couldn’t open this page.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Your game files and library data have not been changed by this screen.
          Try again, or return to the library.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-[var(--accent-contrast)]"
          >
            Try again
          </button>
          <Button href="/library" variant="secondary">
            Library
          </Button>
        </div>
      </div>
    </main>
  );
}
