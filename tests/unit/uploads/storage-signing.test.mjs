import assert from "node:assert/strict";
import test from "node:test";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const client = new S3Client({
  endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: "TEST_ACCESS_KEY_NOT_A_SECRET",
    secretAccessKey: "TEST_SECRET_KEY_NOT_A_SECRET",
  },
});

const bucket = "pixzer-private-test";
const objectKey = "users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/games/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/rom/original";

test("presigned PUT is bound to the reserved object, exact size, no-overwrite condition, and short lifetime", async () => {
  const signed = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentLength: 1234,
      ContentType: "application/octet-stream",
      IfNoneMatch: "*",
    }),
    { expiresIn: 900 },
  );
  const url = new URL(signed);

  assert.equal(url.hostname, "0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com");
  assert.equal(decodeURIComponent(url.pathname), `/${bucket}/${objectKey}`);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  assert.equal(
    url.searchParams.get("X-Amz-SignedHeaders"),
    "content-length;host;if-none-match",
  );
  assert.equal(url.searchParams.has("X-Amz-Signature"), true);
});

test("presigned GET is scoped to a single private object and download disposition", async () => {
  const signed = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ResponseContentDisposition: "attachment; filename*=UTF-8''game.gb",
    }),
    { expiresIn: 120 },
  );
  const url = new URL(signed);

  assert.equal(decodeURIComponent(url.pathname), `/${bucket}/${objectKey}`);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "120");
  assert.match(url.searchParams.get("response-content-disposition"), /^attachment;/);
});
