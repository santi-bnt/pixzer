"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteDriveGameButton({ gameId, title }: { gameId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function removeGame() {
    if (busy || !window.confirm(`Delete “${title}” from your Google Drive and pixzer library?`)) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/delete`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object" || !("deleted" in result) || result.deleted !== true) {
        throw new Error("delete-failed");
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        className="min-h-11 rounded-xl border border-token px-4 text-sm font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-50"
        disabled={busy}
        onClick={() => void removeGame()}
        type="button"
      >
        {busy ? "Deleting…" : "Delete from Drive"}
      </button>
      {error && <span className="text-xs text-accent" role="alert">Could not delete this file. Reconnect Drive and try again.</span>}
    </div>
  );
}
