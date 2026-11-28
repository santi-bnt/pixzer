import "server-only";

import { randomUUID } from "node:crypto";
import { parseDriveUploadLeaseResult } from "@/lib/google-drive/lease-contracts.mjs";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";

export type DriveUploadLease = { leaseId: string; expiresAt: string };
export type AcquireDriveUploadLeaseResult =
  | { kind: "acquired"; lease: DriveUploadLease }
  | { kind: "busy" }
  | { kind: "unavailable" };

/** Acquire a DB-backed lease before any Google resumable-session request. */
export async function acquireDriveUploadLease(
  userId: string,
  uploadId: string,
): Promise<AcquireDriveUploadLeaseResult> {
  const supabase = createPrivilegedSupabaseClient();
  if (!supabase) return { kind: "unavailable" };
  const leaseId = randomUUID();

  try {
    const { data, error } = await supabase.rpc("acquire_drive_upload_chunk_lease", {
      p_user_id: userId,
      p_upload_id: uploadId,
      p_lease_id: leaseId,
    });
    if (error) return { kind: "unavailable" };
    const parsed = parseDriveUploadLeaseResult(data);
    if (parsed.kind === "busy") return { kind: "busy" };
    if (parsed.kind !== "acquired") return { kind: "unavailable" };
    return { kind: "acquired", lease: { leaseId, expiresAt: parsed.expiresAt } };
  } catch {
    return { kind: "unavailable" };
  }
}

/** A stale invocation cannot release a lease after a newer owner has claimed it. */
export async function releaseDriveUploadLease(
  userId: string,
  uploadId: string,
  leaseId: string,
): Promise<boolean> {
  const supabase = createPrivilegedSupabaseClient();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc("release_drive_upload_chunk_lease", {
      p_user_id: userId,
      p_upload_id: uploadId,
      p_lease_id: leaseId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
