import "server-only";

import { decryptDriveSecret, encryptDriveSecret } from "@/lib/google-drive/crypto.mjs";
import type { EncryptedDriveSecret } from "@/lib/google-drive/crypto.mjs";
import { GOOGLE_DRIVE_FILE_SCOPE } from "@/lib/google-drive/contracts.mjs";

export type GoogleDriveConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
};

export function isGoogleDriveSelectedAndEnabled(): boolean {
  return process.env.PIXZER_GAME_STORAGE_PROVIDER === "google_drive" &&
    process.env.PIXZER_GOOGLE_DRIVE_ENABLED === "true";
}

export function getGoogleDriveConfig(): GoogleDriveConfig | null {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!clientId || !clientSecret || !encryptionKey || !siteUrl) return null;

  try {
    const origin = new URL(siteUrl);
    if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) return null;
    const key = Buffer.from(encryptionKey, "base64");
    if (key.byteLength !== 32) return null;
    return {
      clientId,
      clientSecret,
      encryptionKey,
      redirectUri: new URL("/api/drive/callback", origin).toString(),
    };
  } catch {
    return null;
  }
}

export type DriveConnectionCipher = {
  refresh_token_ciphertext: string;
  refresh_token_nonce: string;
  refresh_token_tag: string;
};

export function encryptRefreshToken(refreshToken: string, key: string): DriveConnectionCipher {
  const encrypted = encryptDriveSecret(refreshToken, key);
  return {
    refresh_token_ciphertext: encrypted.ciphertext,
    refresh_token_nonce: encrypted.nonce,
    refresh_token_tag: encrypted.tag,
  };
}

export function decryptRefreshToken(row: DriveConnectionCipher, key: string): string {
  return decryptDriveSecret({
    version: 1,
    ciphertext: row.refresh_token_ciphertext,
    nonce: row.refresh_token_nonce,
    tag: row.refresh_token_tag,
  } satisfies EncryptedDriveSecret, key);
}

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

function parseTokenResponse(value: unknown): GoogleTokenResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.access_token !== "string" || typeof record.expires_in !== "number" ||
      record.token_type !== "Bearer" ||
      (record.refresh_token !== undefined && typeof record.refresh_token !== "string") ||
      (record.scope !== undefined && typeof record.scope !== "string")) return null;
  return record as GoogleTokenResponse;
}

async function requestToken(parameters: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
    cache: "no-store",
  });
  const result: unknown = await response.json().catch(() => null);
  const token = parseTokenResponse(result);
  if (!response.ok || !token) throw new Error("google-drive-token-exchange-failed");
  return token;
}

export async function exchangeDriveCode(
  config: GoogleDriveConfig,
  code: string,
  verifier: string,
): Promise<GoogleTokenResponse> {
  const result = await requestToken(new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  }));
  const scopes = new Set((result.scope ?? "").split(" ").filter(Boolean));
  if (scopes.size !== 1 || !scopes.has(GOOGLE_DRIVE_FILE_SCOPE)) {
    throw new Error("google-drive-scope-or-refresh-token-invalid");
  }
  return result;
}

export async function refreshDriveAccessToken(
  config: GoogleDriveConfig,
  refreshToken: string,
): Promise<string> {
  const result = await requestToken(new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }));
  return result.access_token;
}

export async function fetchDriveAbout(accessToken: string): Promise<{
  permissionId: string;
  emailAddress: string | null;
  storageLimitBytes: number | null;
  storageUsedBytes: number;
}> {
  const url = new URL("https://www.googleapis.com/drive/v3/about");
  url.searchParams.set("fields", "user(permissionId,emailAddress),storageQuota(limit,usage)");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof value !== "object" || value === null) throw new Error("google-drive-profile-unavailable");
  const record = value as Record<string, unknown>;
  const user = record.user as Record<string, unknown> | undefined;
  const quota = record.storageQuota as Record<string, unknown> | undefined;
  const limit = quota?.limit === undefined ? null : Number(quota.limit);
  const usage = Number(quota?.usage ?? 0);
  if (typeof user?.permissionId !== "string" || !user.permissionId ||
      (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) ||
      !Number.isSafeInteger(usage) || usage < 0) throw new Error("google-drive-profile-invalid");
  return {
    permissionId: user.permissionId,
    emailAddress: typeof user.emailAddress === "string" ? user.emailAddress : null,
    storageLimitBytes: limit,
    storageUsedBytes: usage,
  };
}

export async function revokeDriveToken(token: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    cache: "no-store",
  }).catch(() => undefined);
}

export async function driveApiRequest(
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.origin !== "https://www.googleapis.com") throw new Error("google-drive-url-invalid");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(parsed, { ...init, headers, cache: "no-store", redirect: "error" });
}
