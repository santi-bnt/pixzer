import { AppShell } from "@/components/app-shell";
import { Button, GameTile, Notice, SectionTitle } from "@/components/ui";

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
          <div className="text-xs text-muted">SUPPORTED SYSTEMS</div>
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
      <div className="mt-9 flex items-center justify-between">
        <h2 className="text-lg font-semibold">A preview of your shelves</h2>
        <span className="text-xs text-subtle">Illustrative only</span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GameTile
          title="Handheld classics"
          code="GB"
          color="bg-gradient-to-br from-[#c72c32] to-[#6e151a]"
        />
        <GameTile
          title="Colorful worlds"
          code="GBC"
          color="bg-gradient-to-br from-[#55565c] to-[#29292e]"
        />
        <GameTile
          title="Pocket adventures"
          code="GBA"
          color="bg-gradient-to-br from-[#9b4548] to-[#492327]"
        />
        <GameTile
          title="Big screen"
          code="N64"
          color="bg-gradient-to-br from-[#77716b] to-[#3d3935]"
        />
      </div>
    </AppShell>
  );
}
