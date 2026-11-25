import { AppShell } from "@/components/app-shell";
import { SectionTitle } from "@/components/ui";
import { GameUploadForm } from "@/features/library/game-upload-form";
import { DriveStoragePanel } from "@/features/library/drive-storage-panel";
import { getGoogleDriveConfig } from "@/lib/google-drive/server";
import { getR2ServerConfig } from "@/lib/r2/server";
import { hasPrivilegedSupabaseConfig } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ drive?: string | string[] }>;
}) {
  const params = await searchParams;
  const driveValue = Array.isArray(params.drive) ? params.drive[0] : params.drive;
  const driveResult = driveValue === "connected" || driveValue === "failed" || driveValue === "consent-required"
    ? driveValue
    : undefined;
  const storageProvider = process.env.PIXZER_GAME_STORAGE_PROVIDER ?? "google_drive";
  const driveEnabled = storageProvider === "google_drive" &&
    process.env.PIXZER_GOOGLE_DRIVE_ENABLED === "true" &&
    Boolean(getGoogleDriveConfig()) && hasPrivilegedSupabaseConfig();
  const r2Enabled = storageProvider === "r2" &&
    process.env.PIXZER_R2_UPLOADS_ENABLED === "true" &&
    hasPrivilegedSupabaseConfig() && Boolean(getR2ServerConfig());

  return (
    <AppShell active="Add a game">
      <SectionTitle eyebrow="Add to library" title="Bring your own games">
        Choose a supported file you are legally allowed to store. pixzer verifies
        the stored file before adding it to your private library.
      </SectionTitle>
      {storageProvider === "google_drive" ? (
        <DriveStoragePanel enabled={driveEnabled} oauthResult={driveResult} />
      ) : (
        <>
          <GameUploadForm storageEnabled={r2Enabled} />
          <div className="mx-auto mt-5 flex max-w-3xl flex-wrap justify-between gap-2 text-xs text-subtle">
            <span>Private Cloudflare R2 storage</span>
            <span>900 MB per account · 9 GB shared storage ceiling</span>
          </div>
        </>
      )}
    </AppShell>
  );
}
