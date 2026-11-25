import { AppShell } from "@/components/app-shell";
import { SectionTitle } from "@/components/ui";
import { GameUploadForm } from "@/features/library/game-upload-form";
import { DriveStoragePanel } from "@/features/library/drive-storage-panel";
import { areDriveUploadsEnabled, getGoogleDriveConfig, isGoogleDriveSelectedAndEnabled } from "@/lib/google-drive/server";
import { getR2ServerConfig } from "@/lib/r2/server";
import { hasPrivilegedSupabaseConfig } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  const storageProvider = process.env.PIXZER_GAME_STORAGE_PROVIDER ?? "google_drive";
  const driveEnabled = isGoogleDriveSelectedAndEnabled() &&
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
        <DriveStoragePanel enabled={driveEnabled} showUpload uploadsEnabled={driveEnabled && areDriveUploadsEnabled()} />
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
