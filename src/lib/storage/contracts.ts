export type GameStorageProvider = "r2" | "google_drive";

export type StorageGame = {
  id: string;
  ownerId: string;
  fileName: string;
  sizeBytes: number;
  provider: GameStorageProvider;
};

/** Provider implementations issue capabilities only after server-side owner checks. */
export type StorageUploadIntent = {
  uploadId: string;
  expectedSizeBytes: number;
  expiresAt: string;
  resume(): Promise<{ offsetBytes: number; uploadCapability: string }>;
  complete(): Promise<StorageGame>;
};

export type StorageDownload = {
  provider: GameStorageProvider;
  url: string;
  expiresAt?: string;
};
