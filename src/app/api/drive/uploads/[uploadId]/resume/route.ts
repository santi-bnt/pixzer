import { NextResponse } from "next/server";
import { DRIVE_UPLOAD_CHUNK_BYTES } from "@/lib/google-drive/contracts.mjs";
import { getOwnedDriveUpload } from "@/lib/google-drive/resumable-server";
import { isValidUploadId } from "@/lib/r2/upload-validation.mjs";
import { getAuthorizedUser } from "@/lib/supabase/user";

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
    return privateJson({ completed: true, gameId: upload.gameId, driveFileId: upload.driveFileId });
  }

  return privateJson({
    uploadId,
    gameId: upload.gameId,
    fileName: upload.fileName,
    expectedSizeBytes: upload.expectedSizeBytes,
    expiresAt: upload.expiresAt,
    chunkSizeBytes: DRIVE_UPLOAD_CHUNK_BYTES,
  });
}
