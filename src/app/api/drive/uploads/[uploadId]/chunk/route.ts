import { NextResponse } from "next/server";
import { DRIVE_UPLOAD_CHUNK_BYTES, parseDriveUploadChunkRange, parseDriveUploadOffset } from "@/lib/google-drive/contracts.mjs";
import { getDriveUploadSessionStatus, getOwnedDriveUpload } from "@/lib/google-drive/resumable-server";
import { isSameOriginMutation } from "@/lib/r2/route-security";
import { isValidUploadId } from "@/lib/r2/upload-validation.mjs";
import { getAuthorizedUser } from "@/lib/supabase/user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function privateJson(value: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
  });
}

export async function PUT(request: Request, context: { params: Promise<{ uploadId: string }> }): Promise<Response> {
  if (!isSameOriginMutation(request)) return privateJson({ error: "request-not-allowed" }, 403);
  const user = await getAuthorizedUser();
  if (!user) return privateJson({ error: "invited-account-required" }, 401);
  const { uploadId } = await context.params;
  if (!isValidUploadId(uploadId)) return privateJson({ error: "upload-unavailable" }, 404);

  const upload = await getOwnedDriveUpload(user.id, uploadId);
  if (!upload) return privateJson({ error: "upload-unavailable" }, 404);
  if (upload.kind === "completed") return privateJson({ complete: true, gameId: upload.gameId, fileId: upload.driveFileId });

  const chunk = parseDriveUploadChunkRange(request.headers.get("content-range"), upload.expectedSizeBytes, DRIVE_UPLOAD_CHUNK_BYTES);
  if (!chunk || !request.body || chunk.length !== Math.min(DRIVE_UPLOAD_CHUNK_BYTES, upload.expectedSizeBytes - chunk.start)) {
    return privateJson({ error: "invalid-upload-chunk" }, 400);
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== chunk.length)) {
    return privateJson({ error: "invalid-upload-chunk" }, 400);
  }

  const current = await getDriveUploadSessionStatus(upload);
  if (current.kind === "expired") return privateJson({ error: "drive-session-expired" }, 410);
  if (current.kind === "unavailable") return privateJson({ error: "drive-upload-status-unavailable" }, 502);
  if (current.kind === "complete") {
    return privateJson({ complete: true, gameId: upload.gameId, fileId: current.fileId, offset: upload.expectedSizeBytes });
  }
  if (current.offset !== chunk.start) {
    return privateJson({ error: "drive-upload-offset-mismatch", offset: current.offset }, 409);
  }

  let received = 0;
  let invalidLength = false;
  const limitedBody = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(value, controller) {
      received += value.byteLength;
      if (received > chunk.length) {
        invalidLength = true;
        controller.error(new Error("invalid-upload-chunk-length"));
        return;
      }
      controller.enqueue(value);
    },
    flush(controller) {
      if (received !== chunk.length) {
        invalidLength = true;
        controller.error(new Error("invalid-upload-chunk-length"));
      }
    },
  }));

  try {
    const requestInit: RequestInit & { duplex: "half" } = {
      method: "PUT",
      headers: {
        "Content-Range": `bytes ${chunk.start}-${chunk.end}/${chunk.totalBytes}`,
        "Content-Length": String(chunk.length),
        "Content-Type": "application/octet-stream",
      },
      body: limitedBody,
      duplex: "half",
      cache: "no-store",
      redirect: "manual",
    };
    const response = await fetch(upload.sessionUrl, requestInit);

    if (response.status === 404) return privateJson({ error: "drive-session-expired" }, 410);
    if (response.headers.has("location")) return privateJson({ error: "drive-upload-provider-rejected" }, 502);
    if (response.status === 308) {
      const offset = parseDriveUploadOffset(response.headers.get("range"), upload.expectedSizeBytes);
      if (offset === null) return privateJson({ error: "drive-upload-provider-rejected" }, 502);
      return privateJson({ complete: false, offset });
    }
    if (response.status !== 200 && response.status !== 201) return privateJson({ error: "drive-upload-provider-rejected" }, 502);

    const value: unknown = await response.json().catch(() => null);
    const fileId = typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>).id
      : null;
    if (typeof fileId !== "string" || !fileId) return privateJson({ error: "drive-upload-provider-rejected" }, 502);
    return privateJson({ complete: true, fileId, offset: upload.expectedSizeBytes });
  } catch {
    return privateJson({ error: invalidLength ? "invalid-upload-chunk" : "drive-upload-interrupted" }, invalidLength ? 400 : 502);
  }
}
