import { AppShell } from "@/components/app-shell";
import { Button, Notice } from "@/components/ui";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell active="My library">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <a href="/library" className="text-xs text-[#a5a8b8]">
            ← Library
          </a>
          <h1 className="mt-2 text-2xl font-semibold">Game player</h1>
        </div>
        <Button variant="secondary" href="/settings">
          Controls & settings
        </Button>
      </div>
      <div className="panel overflow-hidden rounded-3xl p-3">
        <div className="grid min-h-[55vh] place-items-center rounded-2xl border border-white/[.06] bg-[#090a0e] px-5 text-center">
          <div className="max-w-lg">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/[.06] text-2xl">
              ▣
            </div>
            <h2 className="mt-5 text-xl font-semibold">No game loaded</h2>
            <p className="mt-2 text-sm leading-6 text-[#a5a8b8]">
              EmulatorJS is not integrated yet. This route does not download a
              game or start an emulator.
            </p>
            <div className="mt-5 inline-flex rounded-lg bg-white/[.05] px-3 py-2 font-mono text-xs text-[#878a99]">
              Game reference: {id.slice(0, 24)}
            </div>
            <div className="mt-6">
              <Button href="/library" variant="secondary">
                Return to library
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-3 px-2 py-4 text-xs text-[#777a8a]">
          <span>Keyboard & gamepad · planned</span>
          <span>Save sync · planned</span>
        </div>
      </div>
      <div className="mt-5">
        <Notice
          title="Player foundation"
          body="The player integration will load only a game already authorized for the signed-in user. Each console will be validated with a redistributable homebrew test ROM before it is marked supported."
        />
      </div>
    </AppShell>
  );
}
