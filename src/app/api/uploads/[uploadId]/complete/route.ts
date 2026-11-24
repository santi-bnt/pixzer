import { getAuthorizedUser } from "@/lib/supabase/user";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { createR2Client, getR2ServerConfig } from "@/lib/r2/server";
import { verifyStoredGameObject } from "@/lib/r2/storage-service";
import { isOwnedGameObjectKey, isValidUploadId } from "@/lib/r2/upload-validation.mjs";
import {
  isJsonRequest,
  isSameOriginMutation,
  privateJson,
} from "@/lib/r2/route-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadSessionRow = {
  id: string;
  game_id: string;
  object_key: string;
  expected_size_bytes: number | string;
  status: string;
  expires_at: string;
};

function isUploadSessionRow(value: unknown): value is UploadSessionRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.game_id === "string" &&
    typeof row.object_key === "string" &&
    (typeof row.expected_size_bytes === "number" ||
      typeof row.expected_size_bytes === "string") &&
    typeof row.status === "string" &&
    typeof row.expires_at === "string"
  );
}

function parseVerifiedResult(value: unknown): { gameId: string; sizeBytes: number } | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "object" || candidate === null) return null;
  const row = candidate as Record<string, unknown>;
  const sizeBytes = Number(row.completed_size_bytes);
  if (
    typeof row.completed_game_id !== "string" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 1
  ) {
    return null;
  }
  return { gameId: row.completed_game_id, sizeBytes };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ uploadId: string }> },
): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return privateJson({ error: "request-not-allowed" }, 403);
  }
  if (!isJsonRequest(request)) {
    return privateJson({ error: "invalid-request" }, 415);
  }

  const user = await getAuthorizedUser();
  if (!user) return privateJson({ error: "invited-account-required" }, 401);
  if (process.env.PIXZER_R2_UPLOADS_ENABLED !== "true") {
    return privateJson({ error: "private-storage-not-configured" }, 503);
  }

  const { uploadId } = await context.params;
  if (!isValidUploadId(uploadId)) {
    return privateJson({ error: "upload-unavailable" }, 404);
  }
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).length !== 0
    ) {
      return privateJson({ error: "invalid-request" }, 400);
    }
  } catch {
    return privateJson({ error: "invalid-request" }, 400);
  }

  const supabase = createPrivilegedSupabaseClient();
  const r2Config = getR2ServerConfig();
  if (!supabase || !r2Config) {
    return privateJson({ error: "private-storage-not-configured" }, 503);
  }

  try {
    const { data, error } = await supabase
      .from("upload_sessions")
      .select("id, game_id, object_key, expected_size_bytes, status, expires_at")
      .eq("id", uploadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !isUploadSessionRow(data)) {
      return privateJson({ error: "upload-unavailable" }, 404);
    }

    if (data.status === "completed") {
      return privateJson({ gameId: data.game_id, verified: true }, 200);
    }
    if (
      (data.status !== "pending" && data.status !== "uploaded") ||
      Date.parse(data.expires_at) <= Date.now() ||
      !isOwnedGameObjectKey(data.object_key, user.id)
    ) {
      return privateJson({ error: "upload-expired" }, 410);
    }

    const expectedSizeBytes = Number(data.expected_size_bytes);
    if (!Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes < 1) {
      return privateJson({ error: "upload-unavailable" }, 404);
    }

    const r2 = createR2Client(r2Config);
    let verified: { sizeBytes: number; sha256: string };
    try {
      verified = await verifyStoredGameObject(
        r2,
        r2Config,
        data.object_key,
        expectedSizeBytes,
      );
    } catch {
      // A failed HEAD/read is never treated as an uploaded game.
      return privateJson({ error: "stored-file-not-confirmed" }, 409);
    }

    const { data: completed, error: completeError } = await supabase.rpc(
      "complete_game_upload",
      {
        p_user_id: user.id,
        p_upload_id: uploadId,
        p_verified_size_bytes: verified.sizeBytes,
        p_sha256: verified.sha256,
      },
    );
    if (completeError) {
      if (completeError.code === "42501") {
        return privateJson({ error: "upload-unavailable" }, 404);
      }
      if (completeError.code === "22023") {
        return privateJson({ error: "upload-expired" }, 409);
      }
      return privateJson({ error: "upload-completion-unconfirmed" }, 503);
    }

    const result = parseVerifiedResult(completed);
    if (!result || result.sizeBytes !== expectedSizeBytes) {
      return privateJson({ error: "upload-completion-unconfirmed" }, 503);
    }

    return privateJson({ gameId: result.gameId, sizeBytes: result.sizeBytes, verified: true });
  } catch {
    return privateJson({ error: "private-storage-unavailable" }, 503);
  }
}
