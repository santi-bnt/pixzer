"use client";

import { useCallback, useEffect, useState } from "react";
import { DriveUploadForm } from "@/features/library/drive-upload-form";

type DriveStatus = {
  connected: boolean;
  configured?: boolean;
  reauthorizationRequired?: boolean;
  storageLimitBytes?: number | null;
  storageUsedBytes?: number;
};

async function loadDriveStatus(): Promise<DriveStatus> {
  try {
    const response = await fetch("/api/drive/status", { cache: "no-store", credentials: "same-origin" });
    const result: unknown = await response.json();
    if (response.ok && result && typeof result === "object" && "connected" in result) return result as DriveStatus;
  } catch {
    // Present an unavailable state without exposing provider errors or tokens.
  }
  return { connected: false, configured: false };
}

function formatSize(value: number): string {
  if (value < 1_000_000) return `${(value / 1_000).toFixed(0)} kB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

export function DriveStoragePanel({
  enabled,
  oauthResult,
  showUpload = false,
  uploadsEnabled = false,
}: {
  enabled: boolean;
  oauthResult?: "connected" | "failed" | "consent-required";
  showUpload?: boolean;
  uploadsEnabled?: boolean;
}) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setStatus(await loadDriveStatus());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadDriveStatus().then((nextStatus) => { if (active) setStatus(nextStatus); });
    return () => { active = false; };
  }, [enabled]);

  async function disconnect() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/drive/disconnect", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("disconnect-failed");
      setMessage("Google Drive disconnected. Your files remain in Drive and in your library metadata.");
      await refresh();
    } catch {
      setMessage("pixzer could not disconnect Drive. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel mx-auto max-w-3xl space-y-4 rounded-3xl p-5 sm:p-8" aria-labelledby="drive-storage-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" id="drive-storage-heading">Your Google Drive</h2>
          <p className="mt-1 text-sm text-muted">Files stay in the Drive account you connect. pixzer requests access only to files it creates.</p>
        </div>
        {!enabled || status?.configured === false ? (
          <button className="min-h-11 rounded-xl border border-token px-4 text-sm font-semibold text-muted" type="button" disabled>
            Connect Google Drive
          </button>
        ) : status?.connected ? (
          <button className="min-h-11 rounded-xl border border-token px-4 text-sm font-semibold" disabled={busy} onClick={() => void disconnect()} type="button">
            {busy ? "Disconnecting…" : "Disconnect Drive"}
          </button>
        ) : status && !status.reauthorizationRequired ? (
          <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-[var(--accent-contrast)]" href="/api/drive/connect">
            Connect Google Drive
          </a>
        ) : null}
      </div>
      {(!enabled || status?.configured === false) && <p className="text-sm text-muted">Drive connection is currently unavailable.</p>}
      {message && <p className="text-sm text-muted" role="status">{message}</p>}
      {oauthResult === "connected" && status?.connected && <p className="notice-success text-sm" role="status">Google Drive is connected to this pixzer account.</p>}
      {oauthResult === "failed" && <p className="notice-error text-sm" role="alert">Drive could not connect. Check the authorized Google test account and OAuth callback settings, then try again.</p>}
      {oauthResult === "consent-required" && <p className="notice-error text-sm" role="alert">Google did not return a refresh authorization. Continue once with consent to let pixzer renew Drive access securely.</p>}
      {status?.reauthorizationRequired && <p className="notice-error text-sm" role="alert">Drive authorization expired or was revoked. Reconnect the same Google account to access its files.</p>}
      {(oauthResult === "consent-required" || status?.reauthorizationRequired) && (
        <a className="inline-flex min-h-11 items-center justify-center rounded-xl border border-token px-4 text-sm font-semibold" href="/api/drive/connect?consent=1">
          Reconnect with consent
        </a>
      )}
      {status?.connected && (
        <div className="rounded-2xl border border-token bg-surface-soft p-4 text-sm">
          <p className="font-semibold">Connected</p>
          <p className="mt-1 text-muted">
            Drive usage: {status.storageUsedBytes === undefined ? "Unavailable" : formatSize(status.storageUsedBytes)}
            {status.storageLimitBytes ? ` of ${formatSize(status.storageLimitBytes)}` : " · no finite limit reported"}
          </p>
          <p className="mt-1 text-xs text-subtle">pixzer also enforces a 900 MB game-library limit. Drive space is shared with your other Google services.</p>
        </div>
      )}
      {showUpload && !uploadsEnabled && <p className="text-sm text-muted">Game uploads are currently disabled.</p>}
      {showUpload && uploadsEnabled && status?.connected && <DriveUploadForm onUploaded={refresh} />}
      {enabled && status === null && <p className="text-sm text-muted" aria-live="polite">Checking Drive connection…</p>}
    </section>
  );
}
