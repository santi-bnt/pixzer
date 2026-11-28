import { createHash } from "node:crypto";
import { parseSafeDriveMediaRedirect } from "./contracts.mjs";

const DRIVE_API_ORIGIN = "https://www.googleapis.com";
const MAX_MEDIA_REDIRECTS = 3;

/** Fetch Drive bytes without forwarding the OAuth bearer token off the Drive API origin. */
export async function fetchDriveMedia(fetcher, accessToken, fileId) {
  if (typeof accessToken !== "string" || !accessToken || typeof fileId !== "string" ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(fileId)) throw new Error("drive-download-request-invalid");

  let url = new URL(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, DRIVE_API_ORIGIN);
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetcher(url, {
      headers: redirects === 0 ? { Authorization: `Bearer ${accessToken}`, "Accept-Encoding": "identity" } : { "Accept-Encoding": "identity" },
      cache: "no-store",
      redirect: "manual",
    });

    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (redirects >= MAX_MEDIA_REDIRECTS) throw new Error("drive-download-redirect-limit");
    const destination = parseSafeDriveMediaRedirect(location, url.toString());
    if (!destination) throw new Error("drive-download-redirect-invalid");
    url = destination;
  }
}

/** Stream bytes while checking the provider's trusted size and MD5 without buffering the ROM. */
export function createIntegrityCheckedDriveStream(response, expectedSize, expectedMd5) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 ||
      typeof expectedMd5 !== "string" || !/^[a-f0-9]{32}$/i.test(expectedMd5) ||
      !response?.body || !response.ok) throw new Error("drive-download-response-invalid");
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== expectedSize)) {
    throw new Error("drive-download-size-mismatch");
  }

  const reader = response.body.getReader();
  const hash = createHash("md5");
  let received = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (received !== expectedSize) throw new Error("drive-download-size-mismatch");
          if (hash.digest("hex").toLowerCase() !== expectedMd5.toLowerCase()) throw new Error("drive-download-checksum-mismatch");
          controller.close();
          return;
        }
        received += value.byteLength;
        if (received > expectedSize) throw new Error("drive-download-size-mismatch");
        hash.update(value);
        controller.enqueue(value);
      } catch {
        await reader.cancel().catch(() => undefined);
        controller.error(new Error("drive-download-integrity-failed"));
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}
