"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui";
import { validateUploadRequest } from "@/lib/r2/upload-validation.mjs";

const accept = ".gb,.gbc,.gba,.nds,.n64,.z64,.v64";
type UploadCapability = {
  completed: false;
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function apiErrorMessage(value: unknown): string | null {
  if (!isRecord(value) || typeof value.error !== "string") return null;
  switch (value.error) {
    case "storage-quota-exceeded":
      return "This upload would exceed the 900 MB storage limit. Remove stored games or choose a smaller file.";
    case "file-too-large":
      return "A single game file must be 900 MB or smaller.";
    case "unsupported-file-type":
      return "Choose a GB, GBC, GBA, Nintendo DS, or N64 file.";
    case "invited-account-required":
      return "Sign in with an invited pixzer account to upload games.";
    case "upload-expired":
      return "This upload reservation expired. Choose the file again to start a fresh upload.";
    case "stored-file-not-confirmed":
      return "Private storage did not confirm the complete file. Nothing was added to your library.";
    case "private-storage-not-configured":
    case "private-storage-not-ready":
      return "Secure uploads are not enabled yet. The storage setup or database migration is still pending.";
    default:
      return "The upload could not be confirmed. Check your connection and try again.";
  }
}

function transferFile(
  file: File,
  capability: UploadCapability,
  onProgress: (percentage: number) => void,
  onRequest: (request: XMLHttpRequest) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    onRequest(request);
    request.open("PUT", capability.uploadUrl);
    request.withCredentials = false;
    Object.entries(capability.requiredHeaders).forEach(([name, value]) => {
      request.setRequestHeader(name, value);
    });
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onload = () => resolve(request.status >= 200 && request.status < 300);
    request.onerror = () => resolve(false);
    request.onabort = () => resolve(false);
    request.ontimeout = () => resolve(false);
    request.send(file);
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function GameUploadForm({ storageEnabled }: { storageEnabled: boolean }) {
  const router = useRouter();
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const cancelledRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  function onFileChange(value: File | null) {
    setFile(value);
    setComplete(false);
    setError(null);
    const validated = validateUploadRequest({
      fileName: value?.name ?? "",
      sizeBytes: value?.size ?? 0,
      idempotencyKey: crypto.randomUUID(),
    });
    setTitle(validated.ok ? validated.title : "");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !storageEnabled || busy) return;

    const idempotencyKey = crypto.randomUUID();
    const validated = validateUploadRequest({
      fileName: file.name,
      sizeBytes: file.size,
      title,
      idempotencyKey,
    });
    if (!validated.ok) {
      setError(apiErrorMessage({ error: validated.reason }) ?? "Choose a supported file.");
      return;
    }

    setBusy(true);
    cancelledRef.current = false;
    setError(null);
    setProgress(0);
    setVerifying(false);
    setComplete(false);

    try {
      const intentResponse = await fetch("/api/uploads", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: validated.fileName,
          title: validated.title,
          sizeBytes: validated.sizeBytes,
          idempotencyKey: validated.idempotencyKey,
        }),
      });
      const intentBody: unknown = await readJson(intentResponse);
      if (cancelledRef.current) return;
      if (!intentResponse.ok || !isRecord(intentBody)) {
        setError(apiErrorMessage(intentBody) ?? "Secure storage could not reserve this upload.");
        return;
      }

      if (intentBody.completed === true && typeof intentBody.gameId === "string") {
        setProgress(100);
        setComplete(true);
        router.refresh();
        return;
      }

      if (
        intentBody.completed !== false ||
        typeof intentBody.uploadId !== "string" ||
        typeof intentBody.uploadUrl !== "string" ||
        typeof intentBody.expiresAt !== "string" ||
        !isRecord(intentBody.requiredHeaders) ||
        typeof intentBody.requiredHeaders["Content-Type"] !== "string" ||
        typeof intentBody.requiredHeaders["If-None-Match"] !== "string"
      ) {
        setError("Secure storage returned an invalid upload reservation.");
        return;
      }

      const capability: UploadCapability = {
        completed: false,
        uploadId: intentBody.uploadId,
        uploadUrl: intentBody.uploadUrl,
        expiresAt: intentBody.expiresAt,
        requiredHeaders: {
          "Content-Type": intentBody.requiredHeaders["Content-Type"],
          "If-None-Match": intentBody.requiredHeaders["If-None-Match"],
        },
      };

      await transferFile(file, capability, setProgress, (request) => {
        requestRef.current = request;
      });
      requestRef.current = null;
      if (cancelledRef.current) return;
      setVerifying(true);

      const completionResponse = await fetch(
        `/api/uploads/${encodeURIComponent(capability.uploadId)}/complete`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const completionBody: unknown = await readJson(completionResponse);
      if (
        !completionResponse.ok ||
        !isRecord(completionBody) ||
        completionBody.verified !== true ||
        typeof completionBody.gameId !== "string"
      ) {
        setProgress(0);
        setError(apiErrorMessage(completionBody) ?? "Private storage did not verify the uploaded bytes. Nothing was added.");
        return;
      }

      setProgress(100);
      setComplete(true);
      router.refresh();
    } catch {
      setProgress(0);
      setError("The upload could not reach private storage. No game was marked as available.");
    } finally {
      requestRef.current = null;
      setBusy(false);
      setVerifying(false);
    }
  }

  function cancelUpload() {
    cancelledRef.current = true;
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setProgress(0);
    setError("Upload cancelled. Any unfinished reservation will expire automatically.");
  }

  return (
    <div className="panel mx-auto max-w-3xl rounded-3xl p-5 sm:p-9">
      {!storageEnabled && (
        <Notice
          title="Secure uploads are not enabled yet"
          body="The private bucket, server credentials, and reviewed database migration must be configured before pixzer can accept files. No upload will be reported as successful until R2 confirms it."
        />
      )}
      {storageEnabled && (
        <form className="space-y-5" onSubmit={onSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="game-file">
              Choose a game file
            </label>
            <input
              accept={accept}
              className="block min-h-12 w-full rounded-xl border border-token bg-surface-soft px-3 py-2 text-sm file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:font-semibold file:text-[var(--accent-contrast)]"
              disabled={busy}
              id="game-file"
              onChange={(event) => onFileChange(event.currentTarget.files?.[0] ?? null)}
              required
              type="file"
            />
            <p className="mt-2 text-xs leading-5 text-muted">
              GB, GBC, GBA, Nintendo DS, and N64 files. Maximum 900 MB per file; the account limit is 900 MB total.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="game-title">
              Library title
            </label>
            <input
              autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-token bg-surface-soft px-3 text-sm"
              disabled={busy || !file}
              id="game-title"
              maxLength={160}
              onChange={(event) => setTitle(event.currentTarget.value)}
              required
              value={title}
            />
          </div>

          {file && (
            <div className="rounded-xl border border-token bg-surface-soft p-3 text-xs text-muted">
              <span className="break-all font-medium text-text">{file.name}</span>
              <span className="ml-2">{(file.size / (1024 * 1024)).toFixed(1)} MiB</span>
            </div>
          )}

          {busy && (
            <div aria-live="polite" className="space-y-2">
              <div className="flex justify-between text-xs text-muted">
                <span>{verifying ? "Verifying file from R2" : "Uploading to private storage"}</span>
                <span>{progress}%</span>
              </div>
              <div
                aria-label="Upload progress"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress}
                className="h-2 overflow-hidden rounded-full bg-surface-raised"
                role="progressbar"
              >
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {error && <p className="notice-error text-sm" role="alert">{error}</p>}
          {complete && (
            <div className="notice-success text-sm" role="status">
              R2 confirmed the file and pixzer added it to your private library. It is stored but not playable until a compatible emulator is added.
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!file || busy}
              type="submit"
            >
              {busy ? "Uploading…" : complete ? "Upload another game" : "Upload game"}
            </button>
            {busy && !verifying && (
              <button
                className="min-h-11 rounded-xl border border-token px-4 text-sm font-semibold text-muted"
                onClick={cancelUpload}
                type="button"
              >
                Cancel upload
              </button>
            )}
            {complete && (
              <a className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent" href="/library">
                View library
              </a>
            )}
          </div>
        </form>
      )}

      <div className="mt-5">
        <Notice
          title="Upload only files you are allowed to store"
          body="You are responsible for ensuring each game file is legally obtained. pixzer does not include commercial games, BIOS files, or firmware. Stored games are private to your invited account and are not playable until a compatible emulator is integrated."
        />
      </div>
    </div>
  );
}
