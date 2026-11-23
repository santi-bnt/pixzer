/** Server-only object storage boundary. Implement with signed capabilities in Phase 3. */
export type UploadIntent = {
  gameId: string;
  fileName: string;
  contentLength: number;
  checksumSha256?: string;
};

export type SignedUpload = {
  url: string;
  objectKey: string;
  expiresAt: string;
};

export interface PrivateGameStorage {
  /** Implementations must derive ownership from a verified server session. */
  createUploadIntent(input: UploadIntent): Promise<SignedUpload>;
  createDownloadUrl(
    gameId: string,
  ): Promise<{ url: string; expiresAt: string }>;
  deleteGameObject(gameId: string): Promise<void>;
}
