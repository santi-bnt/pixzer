import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { isValidUploadId } from "@/lib/r2/upload-validation.mjs";
import { getDriveUploadSessionStatus, getOwnedDriveUpload } from "@/lib/google-drive/resumable-server";

export const dynamic = "force-dynamic";

function privateJson(value: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ uploadId: string }> }): Promise<Response> {
  const user = await getAuthorizedUser();
  if (!user) return privateJson({ error: "invited-account-required" }, 401);
  const { uploadId } = await context.params;
  if (!isValidUploadId(uploadId)) return privateJson({ error: "upload-unavailable" }, 404);

  const upload = await getOwnedDriveUpload(user.id, uploadId);
  if (!upload) return privateJson({ error: "upload-unavailable" }, 404);
  if (upload.kind === "completed") {
    return privateJson({ complete: true, gameId: upload.gameId, fileId: upload.driveFileId });
  }

  const status = await getDriveUploadSessionStatus(upload);
  if (status.kind === "expired") return privateJson({ error: "drive-session-expired" }, 410);
  if (status.kind === "unavailable") return privateJson({ error: "drive-upload-status-unavailable" }, 502);
  if (status.kind === "complete") {
    return privateJson({ complete: true, gameId: upload.gameId, fileId: status.fileId, offset: upload.expectedSizeBytes });
  }
  return privateJson({ complete: false, offset: status.offset, expectedSizeBytes: upload.expectedSizeBytes });
}
