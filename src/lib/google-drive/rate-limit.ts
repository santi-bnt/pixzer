import "server-only";

import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
export { driveRateLimitResponse } from "@/lib/google-drive/rate-limit-contracts.mjs";

export type DriveRateLimitAction =
  | "upload_intent"
  | "upload_chunk"
  | "upload_status"
  | "upload_resume"
  | "upload_complete"
  | "drive_status"
  | "drive_download"
  | "drive_delete"
  | "drive_disconnect"
  | "drive_oauth_start"
  | "drive_oauth_callback";

export type DriveRateLimitResult =
  | { kind: "allowed"; remaining: number }
  | { kind: "limited"; retryAfterSeconds: number }
  | { kind: "unavailable" };

/** Consume a shared PostgreSQL fixed-window bucket for the verified account. */
export async function consumeDriveRateLimit(
  userId: string,
  action: DriveRateLimitAction,
): Promise<DriveRateLimitResult> {
  const supabase = createPrivilegedSupabaseClient();
  if (!supabase) return { kind: "unavailable" };

  try {
    const { data, error } = await supabase.rpc("consume_drive_user_rate_limit", {
      p_user_id: userId,
      p_action: action,
    });
    if (error) return { kind: "unavailable" };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.allowed !== "boolean") {
      return { kind: "unavailable" };
    }
    if (row.allowed) {
      return typeof row.remaining_requests === "number" && Number.isSafeInteger(row.remaining_requests) && row.remaining_requests >= 0
        ? { kind: "allowed", remaining: row.remaining_requests }
        : { kind: "unavailable" };
    }
    return typeof row.retry_after_seconds === "number" && Number.isSafeInteger(row.retry_after_seconds) &&
      row.retry_after_seconds >= 1 && row.retry_after_seconds <= 3600
      ? { kind: "limited", retryAfterSeconds: row.retry_after_seconds }
      : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
