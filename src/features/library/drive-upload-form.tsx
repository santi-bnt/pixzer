"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui";
import { DRIVE_UPLOAD_CHUNK_BYTES, nextDriveChunkRange, validateDriveGameUpload } from "@/lib/google-drive/contracts.mjs";

type Capability = { uploadId: string; gameId: string; expectedSizeBytes: number; chunkSizeBytes: number };
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
    case "drive-session-expired": return "This upload session expired. Start a new upload to continue.";
    case "drive-upload-interrupted": return "The connection interrupted the upload. Retry to resume from Google Drive's confirmed position.";
    case "drive-upload-status-unavailable": return "pixzer could not confirm the upload position. Your game was not marked as available.";
    default: return "The upload could not be confirmed. Your file was not marked as available.";
  }
}

async function queryOffset(uploadId: string, totalBytes: number): Promise<{ offset: number; fileId?: string }> {
  const response = await fetch(`/api/drive/uploads/${encodeURIComponent(uploadId)}/status`, {
    credentials: "same-origin", cache: "no-store",
  });
  const result = await readJson(response);
  if (!response.ok || !result) {
    if (response.status === 410) throw new Error("drive-session-expired");
    throw new Error(String(result?.error ?? "drive-upload-status-unavailable"));
  }
  if (result.complete === true && typeof result.fileId === "string") return { offset: totalBytes, fileId: result.fileId };
  const offset = Number(result.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > totalBytes) throw new Error("drive-upload-status-unavailable");
  return { offset };
}

async function uploadChunks(capability: Capability, file: File, onProgress: (value: number) => void): Promise<string> {
  let state = await queryOffset(capability.uploadId, file.size);
  if (state.fileId) return state.fileId;
  let offset = state.offset;
  let attempts = 0;
  while (offset < file.size) {
    const range = nextDriveChunkRange(offset, file.size, capability.chunkSizeBytes);
    if (!range) throw new Error("drive-upload-range-invalid");
    let response: Response;
    try {
      response = await fetch(`/api/drive/uploads/${encodeURIComponent(capability.uploadId)}/chunk`, {
        method: "PUT", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Range": range.contentRange, "Content-Type": "application/octet-stream" },
        body: file.slice(range.start, range.end + 1),
      });
    } catch {
      if (attempts++ >= 4) throw new Error("drive-upload-interrupted");
      state = await queryOffset(capability.uploadId, file.size);
      if (state.fileId) return state.fileId;
      offset = state.offset;
      await new Promise((resolve) => setTimeout(resolve, Math.min(4_000, 250 * (2 ** attempts))));
      continue;
    }

    const result = await readJson(response);
    if (response.status === 410) throw new Error("drive-session-expired");
    if (response.status === 409 || response.status >= 500) {
      if (attempts++ >= 4) throw new Error(String(result?.error ?? "drive-upload-interrupted"));
      state = await queryOffset(capability.uploadId, file.size);
      if (state.fileId) return state.fileId;
      offset = state.offset;
      await new Promise((resolve) => setTimeout(resolve, Math.min(4_000, 250 * (2 ** attempts))));
      continue;
    }
    if (!response.ok || !result) throw new Error(String(result?.error ?? "drive-upload-rejected"));
    if (result.complete === true && typeof result.fileId === "string") {
      onProgress(100);
      return result.fileId;
    }

    const confirmedOffset = Number(result.offset);
    if (!Number.isSafeInteger(confirmedOffset) || confirmedOffset < 0 || confirmedOffset > file.size) {
      throw new Error("drive-upload-range-invalid");
    }
    if (confirmedOffset <= offset) {
      if (attempts++ >= 4) throw new Error("drive-upload-interrupted");
      state = await queryOffset(capability.uploadId, file.size);
      if (state.fileId) return state.fileId;
      offset = state.offset;
      continue;
    }
    offset = confirmedOffset;
    attempts = 0;
    onProgress(Math.min(99, Math.floor(offset / file.size * 100)));
  }

  const finished = await queryOffset(capability.uploadId, file.size);
  if (!finished.fileId) throw new Error("drive-upload-status-unavailable");
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
        if (!resumeResponse.ok || !resume || typeof resume.gameId !== "string" ||
            (resume.completed !== true && (resume.fileName !== file.name || Number(resume.expectedSizeBytes) !== file.size))) {
          throw new Error(String(resume?.error ?? (resumeResponse.status === 410 ? "drive-session-expired" : "drive-upload-status-unavailable")));
        }
        capability = { uploadId: savedUpload.uploadId, gameId: resume.gameId, expectedSizeBytes: file.size, chunkSizeBytes: DRIVE_UPLOAD_CHUNK_BYTES };
      }
      if (!capability) {
        const intentResponse = await fetch("/api/drive/uploads", {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...validated, idempotencyKey: crypto.randomUUID() }),
        });
        const intent = await readJson(intentResponse);
        if (!intentResponse.ok || !intent || typeof intent.uploadId !== "string" || typeof intent.gameId !== "string") {
          throw new Error(String(intent?.error ?? "drive-upload-intent-failed"));
        }
        capability = { uploadId: intent.uploadId, gameId: intent.gameId,
          expectedSizeBytes: file.size, chunkSizeBytes: Number(intent.chunkSizeBytes) || DRIVE_UPLOAD_CHUNK_BYTES };
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
        <div className="flex justify-between text-xs text-muted"><span>Uploading through pixzer to Google Drive</span><span>{progress}%</span></div>
        <div aria-label="Drive upload progress" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress} className="h-2 overflow-hidden rounded-full bg-surface-raised" role="progressbar"><div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div>
      </div>}
      {error && <p className="notice-error text-sm" role="alert">{error}</p>}
      {complete && <p className="notice-success text-sm" role="status">Google Drive confirmed the file and pixzer added it to your library. It is stored but not playable until an emulator is integrated.</p>}
      <button className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-50" disabled={!file || busy} type="submit">{busy ? "Uploading…" : complete ? "Upload another game" : "Upload to my Drive"}</button>
      <Notice title="Private storage" body="The upload session is a temporary, single-file capability. Your Google refresh token stays encrypted on the server and is never sent to this browser." />
    </form>
  );
}
