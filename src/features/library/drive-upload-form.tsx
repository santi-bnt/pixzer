"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui";
import { validateDriveGameUpload } from "@/lib/google-drive/contracts.mjs";

type Capability = { uploadId: string; gameId: string; sessionUrl: string; expectedSizeBytes: number; chunkSizeBytes: number };
const accept = ".gb,.gbc,.gba,.nds,.n64,.z64,.v64";
const activeUploadKey = "pixzer-drive-active-upload";
type SavedUpload = { uploadId: string; fileName: string; sizeBytes: number; lastModified: number };

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  const value: unknown = await response.json().catch(() => null);
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function errorText(code: unknown): string {
  switch (code) {
    case "drive-quota-exceeded": return "This file would exceed pixzer’s 900 MB library quota or the active-upload limit.";
    case "drive-not-connected": return "Connect the same Google Drive account before uploading.";
    case "file-too-large": return "A game file must be 900 MB or smaller.";
    case "drive-file-not-confirmed": return "Google Drive has not confirmed this complete file. It was not added to your library.";
    default: return "The upload could not be confirmed. Your file was not marked as available.";
  }
}

async function queryOffset(sessionUrl: string, totalBytes: number): Promise<{ offset: number; fileId?: string }> {
  const response = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${totalBytes}` },
    cache: "no-store",
  });
  if (response.status === 200 || response.status === 201) {
    const result = await readJson(response);
    if (typeof result?.id !== "string") throw new Error("drive-upload-response-invalid");
    return { offset: totalBytes, fileId: result.id };
  }
  if (response.status !== 308) throw new Error(response.status === 404 ? "drive-session-expired" : "drive-upload-status-failed");
  const range = response.headers.get("range");
  if (!range) return { offset: 0 };
  const match = /^bytes=0-(\d+)$/.exec(range);
  if (!match) throw new Error("drive-upload-range-invalid");
  const offset = Number(match[1]) + 1;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > totalBytes) throw new Error("drive-upload-range-invalid");
  return { offset };
}

async function uploadChunks(capability: Capability, file: File, onProgress: (value: number) => void): Promise<string> {
  let state = await queryOffset(capability.sessionUrl, file.size);
  if (state.fileId) return state.fileId;
  let offset = state.offset;
  let attempts = 0;
  while (offset < file.size) {
    const end = Math.min(file.size, offset + capability.chunkSizeBytes);
    const response = await fetch(capability.sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`, "Content-Type": "application/octet-stream" },
      body: file.slice(offset, end),
      cache: "no-store",
    }).catch(() => null);
    if (!response || response.status >= 500 || response.status === 429 || response.status === 408) {
      if (attempts++ >= 4) throw new Error("drive-upload-retry-limit");
      const retryAfter = response?.headers.get("retry-after");
      const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1_000 : 0;
      await new Promise((resolve) => setTimeout(resolve, Math.min(8_000, retryAfterMs || 500 * (2 ** attempts))));
      state = await queryOffset(capability.sessionUrl, file.size);
      if (state.fileId) return state.fileId;
      offset = state.offset;
      continue;
    }
    if (response.status === 200 || response.status === 201) {
      const result = await readJson(response);
      if (typeof result?.id !== "string") throw new Error("drive-upload-response-invalid");
      onProgress(100);
      return result.id;
    }
    if (response.status !== 308) throw new Error(response.status === 404 ? "drive-session-expired" : "drive-upload-rejected");
    const range = response.headers.get("range");
    if (range) {
      const match = /^bytes=0-(\d+)$/.exec(range);
      if (!match) throw new Error("drive-upload-range-invalid");
      offset = Number(match[1]) + 1;
    } else {
      state = await queryOffset(capability.sessionUrl, file.size);
      if (state.fileId) return state.fileId;
      offset = state.offset;
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size) throw new Error("drive-upload-range-invalid");
    attempts = 0;
    onProgress(Math.min(99, Math.floor(offset / file.size * 100)));
  }
  const finished = await queryOffset(capability.sessionUrl, file.size);
  if (!finished.fileId) throw new Error("drive-upload-not-finished");
  return finished.fileId;
}

export function DriveUploadForm({ onUploaded }: { onUploaded: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const validated = validateDriveGameUpload({ fileName: file.name, title, sizeBytes: file.size });
    if (!validated) { setError("Choose a valid GB, GBC, GBA, NDS, or N64 file no larger than 900 MB."); return; }
    setBusy(true); setError(null); setComplete(false); setProgress(0);
    try {
      let savedUpload: SavedUpload | null = null;
      try {
        const value: unknown = JSON.parse(sessionStorage.getItem(activeUploadKey) ?? "null");
        if (value && typeof value === "object" && "uploadId" in value && "fileName" in value &&
            "sizeBytes" in value && "lastModified" in value && typeof value.uploadId === "string" &&
            typeof value.fileName === "string" && typeof value.sizeBytes === "number" &&
            typeof value.lastModified === "number") savedUpload = value as SavedUpload;
      } catch {
        sessionStorage.removeItem(activeUploadKey);
      }
      let capability: Capability | null = null;
      if (savedUpload && savedUpload.fileName === file.name && savedUpload.sizeBytes === file.size && savedUpload.lastModified === file.lastModified) {
        const resumeResponse = await fetch(`/api/drive/uploads/${encodeURIComponent(savedUpload.uploadId)}/resume`, { cache: "no-store" });
        const resume = await readJson(resumeResponse);
        if (resumeResponse.ok && resume && resume.fileName === file.name && Number(resume.expectedSizeBytes) === file.size &&
            typeof resume.sessionUrl === "string" && typeof resume.gameId === "string") {
          capability = { uploadId: savedUpload.uploadId, gameId: resume.gameId, sessionUrl: resume.sessionUrl, expectedSizeBytes: file.size, chunkSizeBytes: 8 * 1024 * 1024 };
        }
      }
      if (!capability) {
        const intentResponse = await fetch("/api/drive/uploads", {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...validated, idempotencyKey: crypto.randomUUID() }),
        });
        const intent = await readJson(intentResponse);
        if (!intentResponse.ok || !intent || typeof intent.uploadId !== "string" || typeof intent.gameId !== "string" || typeof intent.sessionUrl !== "string") {
          throw new Error(String(intent?.error ?? "drive-upload-intent-failed"));
        }
        capability = { uploadId: intent.uploadId, gameId: intent.gameId, sessionUrl: intent.sessionUrl,
          expectedSizeBytes: file.size, chunkSizeBytes: Number(intent.chunkSizeBytes) || 8 * 1024 * 1024 };
        try {
          sessionStorage.setItem(activeUploadKey, JSON.stringify({
            uploadId: capability.uploadId,
            fileName: file.name,
            sizeBytes: file.size,
            lastModified: file.lastModified,
          } satisfies SavedUpload));
        } catch {
          // The upload remains usable in this page; reload-based resume is optional.
        }
      }

      const driveFileId = await uploadChunks(capability, file, setProgress);
      setProgress(100);
      const completionResponse = await fetch(`/api/drive/uploads/${encodeURIComponent(capability.uploadId)}/complete`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId }),
      });
      const completion = await readJson(completionResponse);
      if (!completionResponse.ok || completion?.verified !== true) throw new Error(String(completion?.error ?? "drive-completion-unconfirmed"));
      sessionStorage.removeItem(activeUploadKey);
      setComplete(true);
      router.refresh();
      onUploaded();
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "drive-upload-failed";
      if (code === "drive-session-expired") sessionStorage.removeItem(activeUploadKey);
      setError(errorText(code));
    } finally { setBusy(false); }
  }

  return (
    <form className="space-y-4 border-t border-token pt-5" onSubmit={(event) => void onSubmit(event)}>
      <div>
        <label className="mb-2 block text-sm font-semibold" htmlFor="drive-game-file">Choose a game file</label>
        <input accept={accept} className="block min-h-12 w-full rounded-xl border border-token bg-surface-soft px-3 py-2 text-sm" disabled={busy} id="drive-game-file" onChange={(event) => {
          const selected = event.currentTarget.files?.[0] ?? null;
          setFile(selected); setComplete(false); setError(null);
          const valid = selected && validateDriveGameUpload({ fileName: selected.name, title: selected.name.replace(/\.[^.]+$/, ""), sizeBytes: selected.size });
          setTitle(valid?.title ?? "");
        }} required type="file" />
        <p className="mt-2 text-xs text-muted">Supported systems: GB, GBC, GBA, Nintendo DS, and N64. 900 MB per pixzer account.</p>
      </div>
      {file && <div>
        <label className="mb-2 block text-sm font-semibold" htmlFor="drive-game-title">Library title</label>
        <input className="min-h-11 w-full rounded-xl border border-token bg-surface-soft px-3 text-sm" disabled={busy} id="drive-game-title" maxLength={160} onChange={(event) => setTitle(event.currentTarget.value)} required value={title} />
      </div>}
      {busy && <div aria-live="polite" className="space-y-2">
        <div className="flex justify-between text-xs text-muted"><span>Uploading directly to Google Drive</span><span>{progress}%</span></div>
        <div aria-label="Drive upload progress" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress} className="h-2 overflow-hidden rounded-full bg-surface-raised" role="progressbar"><div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div>
      </div>}
      {error && <p className="notice-error text-sm" role="alert">{error}</p>}
      {complete && <p className="notice-success text-sm" role="status">Google Drive confirmed the file and pixzer added it to your library. It is stored but not playable until an emulator is integrated.</p>}
      <button className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-50" disabled={!file || busy} type="submit">{busy ? "Uploading…" : complete ? "Upload another game" : "Upload to my Drive"}</button>
      <Notice title="Private storage" body="The upload session is a temporary, single-file capability. Your Google refresh token stays encrypted on the server and is never sent to this browser." />
    </form>
  );
}
