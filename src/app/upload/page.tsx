import { AppShell } from "@/components/app-shell";
import { Button, Notice, SectionTitle } from "@/components/ui";

export default function UploadPage() {
  return (
    <AppShell active="Add a game">
      <SectionTitle eyebrow="Add to library" title="Bring your own games">
        Upload support is planned for a later phase. PocketArcade will only
        accept files you are legally allowed to use.
      </SectionTitle>
      <div className="panel mx-auto max-w-3xl rounded-3xl p-5 sm:p-9">
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-violet-200/20 bg-violet-300/[.025] px-5 py-10 text-center">
          <div>
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-violet-300/10 text-2xl text-violet-200">
              ↑
            </div>
            <h2 className="mt-4 text-lg font-semibold">
              Secure uploads are not ready yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#a5a8b8]">
              This screen does not upload or store files. Once available, you’ll
              be able to choose a supported game file and see its storage usage.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {[".gb", ".gbc", ".gba", ".nds", ".n64", ".z64", ".v64"].map(
                (ext) => (
                  <span
                    key={ext}
                    className="pill rounded-md px-2 py-1 font-mono text-xs text-[#b5b7c5]"
                  >
                    {ext}
                  </span>
                ),
              )}
            </div>
            <Button disabled>Choose a game file</Button>
          </div>
        </div>
        <div className="mt-5">
          <Notice
            title="Keep ownership in mind"
            body="You are responsible for ensuring each game file is legally obtained and that you have the right to store it. No commercial games, BIOS files, or firmware are provided here."
          />
        </div>
      </div>
      <div className="mx-auto mt-5 flex max-w-3xl justify-between text-xs text-[#777a8a]">
        <span>Private storage · planned</span>
        <span>Quota checks · planned</span>
      </div>
    </AppShell>
  );
}
