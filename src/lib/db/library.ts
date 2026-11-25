import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";

export type LibraryGame = {
  id: string;
  title: string;
  console: "gb" | "gbc" | "gba" | "nds" | "n64";
  fileName: string;
  sizeBytes: number;
  isFavorite: boolean;
  createdAt: string;
  storageProvider: "r2" | "google_drive";
};

export type UserLibrary = {
  games: LibraryGame[];
  committedBytes: number;
  reservedBytes: number;
  status: "ready" | "unavailable";
};

function isConsole(value: string): value is LibraryGame["console"] {
  return value === "gb" || value === "gbc" || value === "gba" || value === "nds" || value === "n64";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBytes(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseGame(value: unknown, userId: string): LibraryGame | null {
  if (!isRecord(value)) return null;
  const sizeBytes = parseBytes(value.size_bytes);
  const storageProvider = value.storage_provider === undefined ? "r2" : value.storage_provider;
  if (
    value.user_id !== userId ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.console !== "string" ||
    !isConsole(value.console) ||
    typeof value.file_name !== "string" ||
    sizeBytes === null ||
    typeof value.is_favorite !== "boolean" ||
    typeof value.created_at !== "string"
    || (storageProvider !== "r2" && storageProvider !== "google_drive")
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    console: value.console,
    fileName: value.file_name,
    sizeBytes,
    isFavorite: value.is_favorite,
    createdAt: value.created_at,
    storageProvider,
  };
}

function parseReservedBytes(value: unknown): number | null {
  if (!isRecord(value)) return null;
  if (value.status !== "pending" && value.status !== "uploaded" && value.status !== "uploading") return 0;
  if (typeof value.expires_at !== "string" || Date.parse(value.expires_at) <= Date.now()) {
    return 0;
  }
  return parseBytes(value.expected_size_bytes);
}

/** Read only this invited user's rows through the normal cookie-bound RLS client. */
export async function getUserLibrary(userId: string): Promise<UserLibrary> {
  try {
    const supabase = await createClient();
    const gameResult = await supabase
      .from("games")
      .select("id, user_id, title, console, file_name, size_bytes, is_favorite, created_at, storage_provider")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    // Keep the deployed app compatible while the provider migration remains unapplied.
    let gameRows: unknown = gameResult.data;
    let gameError: unknown = gameResult.error;
    if (gameResult.error) {
      const fallback = await supabase
        .from("games")
        .select("id, user_id, title, console, file_name, size_bytes, is_favorite, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      gameRows = fallback.data;
      gameError = fallback.error;
    }
    const admin = process.env.PIXZER_GOOGLE_DRIVE_ENABLED === "true"
      ? createPrivilegedSupabaseClient()
      : null;
    if (process.env.PIXZER_GOOGLE_DRIVE_ENABLED === "true" && !admin) {
      return { games: [], committedBytes: 0, reservedBytes: 0, status: "unavailable" };
    }
    const [uploadResult, driveUploadResult] = await Promise.all([
      supabase
        .from("upload_sessions")
        .select("expected_size_bytes, status, expires_at")
        .eq("user_id", userId)
        .in("status", ["pending", "uploaded"]),
      admin
        ? admin.from("drive_upload_sessions").select("expected_size_bytes, status, expires_at")
            .eq("user_id", userId).in("status", ["pending", "uploading"])
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (gameError || uploadResult.error || driveUploadResult.error) {
      return { games: [], committedBytes: 0, reservedBytes: 0, status: "unavailable" };
    }

    const games: LibraryGame[] = [];
    if (Array.isArray(gameRows)) {
      for (const row of gameRows) {
        const game = parseGame(row, userId);
        if (!game) {
          return { games: [], committedBytes: 0, reservedBytes: 0, status: "unavailable" };
        }
        games.push(game);
      }
    }

    let committedBytes = 0;
    for (const game of games) committedBytes += game.sizeBytes;

    let reservedBytes = 0;
    if (Array.isArray(uploadResult.data)) {
      for (const row of uploadResult.data) {
        const bytes = parseReservedBytes(row);
        if (bytes === null) {
          return { games: [], committedBytes: 0, reservedBytes: 0, status: "unavailable" };
        }
        reservedBytes += bytes;
      }
    }
    if (Array.isArray(driveUploadResult.data)) {
      for (const row of driveUploadResult.data) {
        const bytes = parseReservedBytes(row);
        if (bytes === null) return { games: [], committedBytes: 0, reservedBytes: 0, status: "unavailable" };
        reservedBytes += bytes;
      }
    }

    return { games, committedBytes, reservedBytes, status: "ready" };
  } catch {
    return { games: [], committedBytes: 0, reservedBytes: 0, status: "unavailable" };
  }
}
