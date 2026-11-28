import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { isValidUploadId } from "@/lib/r2/upload-validation.mjs";
import { getDriveUploadSessionStatus, getOwnedDriveUpload } from "@/lib/google-drive/resumable-server";
import { acquireDriveUploadLease, releaseDriveUploadLease } from "@/lib/google-drive/upload-lease";
import { DRIVE_UPLOAD_OPERATION_TIMEOUT_MS } from "@/lib/google-drive/lease-contracts.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function privateJson(value: Record<string, unknown>, status = 200, retryAfter?: number): Response {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
}

export async function GET(request: Request, context: { params: Promise<{ uploadId: string }> }): Promise<Response> {
  const user = await getAuthorizedUser();
  if (!user) return privateJson({ error: "invited-account-required" }, 401);
  const { uploadId } = await context.params;
  if (!isValidUploadId(uploadId)) return privateJson({ error: "upload-unavailable" }, 404);

  const upload = await getOwnedDriveUpload(user.id, uploadId);
  if (!upload) return privateJson({ error: "upload-unavailable" }, 404);
  if (upload.kind === "completed") {
    return privateJson({ complete: true, gameId: upload.gameId, fileId: upload.driveFileId });
  }

  const acquired = await acquireDriveUploadLease(user.id, uploadId);
  if (acquired.kind === "busy") return privateJson({ error: "drive-upload-busy" }, 409, 2);
  if (acquired.kind !== "acquired") return privateJson({ error: "drive-upload-lock-unavailable" }, 503, 2);

  let safeToReleaseLease = true;
  try {
    const operationSignal = AbortSignal.any([request.signal, AbortSignal.timeout(DRIVE_UPLOAD_OPERATION_TIMEOUT_MS)]);
    const status = await getDriveUploadSessionStatus(upload, operationSignal);
    if (status.kind === "expired") return privateJson({ error: "drive-session-expired" }, 410);
    if (status.kind === "unavailable") {
      safeToReleaseLease = status.safeToReleaseLease;
      return privateJson({ error: "drive-upload-status-unavailable" }, 502);
    }
    if (status.kind === "complete") {
      return privateJson({ complete: true, gameId: upload.gameId, fileId: status.fileId, offset: upload.expectedSizeBytes });
    }
    return privateJson({ complete: false, offset: status.offset, expectedSizeBytes: upload.expectedSizeBytes });
  } finally {
    if (safeToReleaseLease) await releaseDriveUploadLease(user.id, uploadId, acquired.lease.leaseId);
  }
}
