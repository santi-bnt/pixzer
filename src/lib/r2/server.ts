import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

export type R2ServerConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
};

export function getR2ServerConfig(): R2ServerConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();
  const endpointValue = process.env.R2_ENDPOINT?.trim();

  if (
    !accountId ||
    !/^[a-f\d]{32}$/i.test(accountId) ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucketName ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName) ||
    !endpointValue
  ) {
    return null;
  }

  try {
    const endpoint = new URL(endpointValue);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.hostname !== `${accountId}.r2.cloudflarestorage.com` ||
      endpoint.pathname !== "/" ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.username ||
      endpoint.password
    ) {
      return null;
    }

    return {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      endpoint: endpoint.origin,
    };
  } catch {
    return null;
  }
}

export function createR2Client(config: R2ServerConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}
