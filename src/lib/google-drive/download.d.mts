export function fetchDriveMedia(fetcher: typeof fetch, accessToken: string, fileId: string): Promise<Response>;
export function createIntegrityCheckedDriveStream(response: Response, expectedSize: number, expectedMd5: string): ReadableStream<Uint8Array>;
