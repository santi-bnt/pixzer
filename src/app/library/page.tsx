import { AppShell } from "@/components/app-shell";
import { ConsolePlatformShowcase } from "@/components/console-platform-showcase";
import { Button, Notice, SectionTitle } from "@/components/ui";

export default function LibraryPage() {
  return (
    <AppShell active="My library">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle eyebrow="Your space" title="My library">
          An intentional home for the games you own. Your collection has not
          been connected yet.
        </SectionTitle>
        <Button href="/upload">＋ Add a game</Button>
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="panel rounded-2xl p-5">
          <div className="text-xs text-muted">IN YOUR LIBRARY</div>
          <div className="mt-3 text-3xl font-semibold">—</div>
          <div className="mt-1 text-xs text-subtle">No games yet</div>
        </div>
        <div className="panel rounded-2xl p-5">
          <div className="text-xs text-muted">STORAGE USED</div>
          <div className="mt-3 text-3xl font-semibold">—</div>
          <div className="mt-1 text-xs text-subtle">
            Available after account setup
          </div>
        </div>
        <div className="panel rounded-2xl p-5">
          <div className="text-xs text-muted">PLATFORM TARGETS</div>
          <div className="mt-3 text-3xl font-semibold">5</div>
          <div className="mt-1 text-xs text-subtle">
            Compatibility testing pending
          </div>
        </div>
      </div>
      <Notice
        title="Your private library is coming together"
        body="Secure uploads are not available yet. Nothing has been uploaded or stored. When uploads are enabled, your games will be private to your account."
      />
      <div className="mt-8 -mx-5 sm:-mx-6">
        <ConsolePlatformShowcase
          heading="A closer look at the hardware."
          description="Stylized illustrations of pixzer's planned platforms. Compatibility testing is still in progress; no games are shown here."
        />
      </div>
    </AppShell>
  );
}
