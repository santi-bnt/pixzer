import { AppShell } from "@/components/app-shell";
import { SectionTitle } from "@/components/ui";
import { GameUploadForm } from "@/features/library/game-upload-form";
import { getR2ServerConfig } from "@/lib/r2/server";
import { hasPrivilegedSupabaseConfig } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  const storageEnabled =
    process.env.PIXZER_R2_UPLOADS_ENABLED === "true" &&
    hasPrivilegedSupabaseConfig() &&
    Boolean(getR2ServerConfig());

  return (
    <AppShell active="Add a game">
      <SectionTitle eyebrow="Add to library" title="Bring your own games">
        Choose a supported file you are legally allowed to store. pixzer verifies
        each upload in private storage before adding it to your library.
      </SectionTitle>
      <GameUploadForm storageEnabled={storageEnabled} />
      <div className="mx-auto mt-5 flex max-w-3xl flex-wrap justify-between gap-2 text-xs text-subtle">
        <span>Private Cloudflare R2 storage</span>
        <span>900 MB per account · 9 GB shared storage ceiling</span>
      </div>
    </AppShell>
  );
}
