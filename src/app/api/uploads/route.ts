import {
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import {
  createR2Client,
  getR2ServerConfig,
} from "@/lib/r2/server";
import {
  getBoundedUploadUrlTtl,
  isOwnedGameObjectKey,
  validateUploadRequest,
} from "@/lib/r2/upload-validation.mjs";
import {
  createGameUploadUrl,
  getGameUploadHeaders,
  type ReservedUpload,
} from "@/lib/r2/storage-service";
import {
  isJsonRequest,
  isSameOriginMutation,
  privateJson,
} from "@/lib/r2/route-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadRpcRow = {
  reserved_upload_id: string;
  reserved_game_id: string;
  staging_object_key: string;
  reserved_expires_at: string;
  reserved_status: ReservedUpload["status"];
};

function isUploadRpcRow(value: unknown): value is UploadRpcRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.reserved_upload_id === "string" &&
    typeof row.reserved_game_id === "string" &&
    typeof row.staging_object_key === "string" &&
    typeof row.reserved_expires_at === "string" &&
    (row.reserved_status === "pending" ||
      row.reserved_status === "uploaded" ||
      row.reserved_status === "completed" ||
      row.reserved_status === "failed" ||
      row.reserved_status === "expired")
  );
}

function parseUploadRpcRow(value: unknown): UploadRpcRow | null {
  if (Array.isArray(value)) return isUploadRpcRow(value[0]) ? value[0] : null;
  return isUploadRpcRow(value) ? value : null;
}

async function removeExpiredReservations(
  supabase: NonNullable<ReturnType<typeof createPrivilegedSupabaseClient>>,
  r2: ReturnType<typeof createR2Client>,
  bucketName: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("upload_sessions")
    .select("id, object_key")
    .eq("user_id", userId)
    .in("status", ["pending", "uploaded", "expired"])
    .lt("expires_at", new Date().toISOString())
    .limit(25);
  if (error) throw new Error("expired-reservation-query-failed");
  if (!Array.isArray(data)) return;

  for (const item of data) {
    if (typeof item !== "object" || item === null) {
      throw new Error("expired-reservation-invalid");
    }
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.object_key !== "string" ||
      !isOwnedGameObjectKey(row.object_key, userId)
    ) {
      throw new Error("expired-reservation-invalid");
    }

    const { error: expireError } = await supabase.rpc("expire_game_upload", {
      p_user_id: userId,
      p_upload_id: row.id,
    });
    if (expireError) throw new Error("expired-reservation-update-failed");

    const { data: latest, error: latestError } = await supabase
      .from("upload_sessions")
      .select("status")
      .eq("id", row.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (latestError) throw new Error("expired-reservation-query-failed");
    if (latest?.status !== "expired") continue;

    // Expire in PostgreSQL before deleting from R2. A concurrent completion
    // therefore cannot create a games row just before its object is removed.
    await r2.send(
      new DeleteObjectCommand({ Bucket: bucketName, Key: row.object_key }),
    );
  }
}

export async function POST(request: Request): Promise<Response> {
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

  const supabase = createPrivilegedSupabaseClient();
  const r2Config = getR2ServerConfig();
  if (!supabase || !r2Config) {
    return privateJson({ error: "private-storage-not-configured" }, 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ error: "invalid-request" }, 400);
  }
  const validated = validateUploadRequest(body);
  if (!validated.ok) {
    const status = validated.reason === "file-too-large" ? 413 : 400;
    return privateJson({ error: validated.reason }, status);
  }

  try {
    const r2 = createR2Client(r2Config);
    await removeExpiredReservations(supabase, r2, r2Config.bucketName, user.id);

    const { data, error } = await supabase.rpc("reserve_game_upload", {
      p_user_id: user.id,
      p_file_name: validated.fileName,
      p_title: validated.title,
      p_console: validated.console,
      p_expected_size_bytes: validated.sizeBytes,
      p_idempotency_key: validated.idempotencyKey,
    });
    if (error) {
      if (error.code === "23514") {
        return privateJson({ error: "storage-quota-exceeded" }, 409);
      }
      if (error.code === "22023") {
        return privateJson({ error: "upload-request-rejected" }, 409);
      }
      return privateJson({ error: "private-storage-not-ready" }, 503);
    }

    const row = parseUploadRpcRow(data);
    if (!row) return privateJson({ error: "private-storage-not-ready" }, 503);

    if (row.reserved_status === "completed") {
      return privateJson(
        { completed: true, gameId: row.reserved_game_id, uploadId: row.reserved_upload_id },
        200,
      );
    }
    if (row.reserved_status !== "pending" && row.reserved_status !== "uploaded") {
      return privateJson({ error: "upload-expired" }, 409);
    }
    if (
      !isOwnedGameObjectKey(row.staging_object_key, user.id) ||
      Date.parse(row.reserved_expires_at) <= Date.now()
    ) {
      return privateJson({ error: "upload-expired" }, 409);
    }

    const upload: ReservedUpload = {
      id: row.reserved_upload_id,
      gameId: row.reserved_game_id,
      objectKey: row.staging_object_key,
      expiresAt: row.reserved_expires_at,
      status: row.reserved_status,
      expectedSizeBytes: validated.sizeBytes,
      fileName: validated.fileName,
    };
    const reservationSecondsRemaining = getBoundedUploadUrlTtl(upload.expiresAt);
    if (reservationSecondsRemaining < 1) {
      return privateJson({ error: "upload-expired" }, 409);
    }
    const signedUrl = await createGameUploadUrl(
      r2,
      r2Config,
      upload,
      Math.min(900, reservationSecondsRemaining),
    );

    return privateJson({
      completed: false,
      uploadId: upload.id,
      uploadUrl: signedUrl,
      expiresAt: upload.expiresAt,
      requiredHeaders: getGameUploadHeaders(),
    }, 201);
  } catch {
    return privateJson({ error: "private-storage-unavailable" }, 503);
  }
}
