import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import type { R2ServerConfig } from "@/lib/r2/server";

export const GAME_UPLOAD_URL_TTL_SECONDS = 900;
export const GAME_DOWNLOAD_URL_TTL_SECONDS = 120;
export const GAME_UPLOAD_CONTENT_TYPE = "application/octet-stream";

export type ReservedUpload = {
  id: string;
  gameId: string;
  objectKey: string;
  expiresAt: string;
  status: "pending" | "uploaded" | "completed" | "failed" | "expired";
  expectedSizeBytes: number;
  fileName: string;
};

export async function createGameUploadUrl(
  client: S3Client,
  config: R2ServerConfig,
  upload: ReservedUpload,
  expiresIn = GAME_UPLOAD_URL_TTL_SECONDS,
): Promise<string> {
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > GAME_UPLOAD_URL_TTL_SECONDS) {
    throw new Error("invalid-upload-url-lifetime");
  }
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: upload.objectKey,
      ContentLength: upload.expectedSizeBytes,
      ContentType: GAME_UPLOAD_CONTENT_TYPE,
      IfNoneMatch: "*",
    }),
    { expiresIn },
  );
}

export async function createGameDownloadUrl(
  client: S3Client,
  config: R2ServerConfig,
  objectKey: string,
  fileName: string,
): Promise<string> {
  const encodedFileName = encodeURIComponent(fileName.replace(/["\\]/g, "_"));
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodedFileName}`,
      ResponseContentType: GAME_UPLOAD_CONTENT_TYPE,
    }),
    { expiresIn: GAME_DOWNLOAD_URL_TTL_SECONDS },
  );
}

export async function deleteGameObject(
  client: S3Client,
  config: R2ServerConfig,
  objectKey: string,
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({ Bucket: config.bucketName, Key: objectKey }),
  );
}

export async function verifyStoredGameObject(
  client: S3Client,
  config: R2ServerConfig,
  objectKey: string,
  expectedSizeBytes: number,
): Promise<{ sizeBytes: number; sha256: string }> {
  const head = await client.send(
    new HeadObjectCommand({ Bucket: config.bucketName, Key: objectKey }),
  );
  if (
    !Number.isSafeInteger(head.ContentLength) ||
    head.ContentLength !== expectedSizeBytes
  ) {
    throw new Error("stored-object-size-mismatch");
  }

  const response = await client.send(
    new GetObjectCommand({ Bucket: config.bucketName, Key: objectKey }),
  );
  const body = response.Body;
  if (!isAsyncByteStream(body)) throw new Error("stored-object-unreadable");

  const hash = createHash("sha256");
  let sizeBytes = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) throw new Error("stored-object-unreadable");
    sizeBytes += chunk.byteLength;
    if (sizeBytes > expectedSizeBytes) throw new Error("stored-object-size-mismatch");
    hash.update(chunk);
  }
  if (sizeBytes !== expectedSizeBytes) throw new Error("stored-object-size-mismatch");

  return { sizeBytes, sha256: hash.digest("hex") };
}

function isAsyncByteStream(value: unknown): value is AsyncIterable<Uint8Array> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value
  );
}

/** A presigned upload URL is usable only for one create, with an exact byte length. */
export function getGameUploadHeaders(): Record<string, string> {
  return {
    "Content-Type": GAME_UPLOAD_CONTENT_TYPE,
    "If-None-Match": "*",
  };
}
