import { AppShell } from "@/components/app-shell";
import { ConsolePlatformShowcase } from "@/components/console-platform-showcase";
import { Button, Notice } from "@/components/ui";
import { getUserLibrary } from "@/lib/db/library";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { DeleteDriveGameButton } from "@/features/library/delete-drive-game-button";
import { DriveStoragePanel } from "@/features/library/drive-storage-panel";
import { getGoogleDriveConfig, isGoogleDriveSelectedAndEnabled } from "@/lib/google-drive/server";
import { hasPrivilegedSupabaseConfig } from "@/lib/supabase/admin";

const consoleNames: Record<string, string> = {
  gb: "Game Boy",
  gbc: "Game Boy Color",
  gba: "Game Boy Advance",
  nds: "Nintendo DS",
  n64: "Nintendo 64",
};

function formatSize(bytes: number): string {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(0)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export default async function LibraryPage({ searchParams }: {
  searchParams: Promise<{ drive?: string | string[] }>;
}) {
  const { drive } = await searchParams;
  const driveResult = drive === "connected" || drive === "failed" || drive === "consent-required"
    ? drive
    : undefined;
  const driveSelected = (process.env.PIXZER_GAME_STORAGE_PROVIDER ?? "google_drive") === "google_drive";
  const driveEnabled = isGoogleDriveSelectedAndEnabled() &&
    Boolean(getGoogleDriveConfig()) && hasPrivilegedSupabaseConfig();
  const user = await getAuthorizedUser();
  const library = user
    ? await getUserLibrary(user.id)
    : { games: [], committedBytes: 0, reservedBytes: 0, status: "unavailable" as const };
  const gamesAvailable = library.status === "ready";
  const totalBytes = library.committedBytes + library.reservedBytes;

  return (
    <AppShell active="My library">
      <header className="mb-8 grid min-w-0 gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-8">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-accent">
            Your space
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            My library
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Games stored by your invited account stay private to you. Stored
            games are not playable until a compatible emulator is integrated.
          </p>
        </div>
        <div className="w-full sm:w-auto [&>a]:w-full sm:[&>a]:w-auto">
          <Button href="/upload">+ Add a game</Button>
        </div>
      </header>
      {driveSelected && (
        <div className="mb-8">
          <DriveStoragePanel enabled={driveEnabled} oauthResult={driveResult} />
        </div>
      )}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="panel rounded-2xl p-5">
          <div className="text-xs text-muted">IN YOUR LIBRARY</div>
          <div className="mt-3 text-3xl font-semibold">
            {gamesAvailable ? library.games.length : "—"}
          </div>
          <div className="mt-1 text-xs text-subtle">
            {gamesAvailable ? "Verified stored games" : "Library unavailable"}
          </div>
        </div>
        <div className="panel rounded-2xl p-5">
          <div className="text-xs text-muted">STORAGE USED</div>
          <div className="mt-3 text-3xl font-semibold">
            {gamesAvailable ? formatSize(totalBytes) : "—"}
          </div>
          <div className="mt-1 text-xs text-subtle">of 900 MB · includes pending uploads</div>
        </div>
        <div className="panel rounded-2xl p-5">
          <div className="text-xs text-muted">PLATFORM TARGETS</div>
          <div className="mt-3 text-3xl font-semibold">5</div>
          <div className="mt-1 text-xs text-subtle">
            Compatibility testing pending
          </div>
        </div>
      </div>
      {!gamesAvailable ? (
        <Notice
          title="Your library could not be loaded"
          body="Try reloading this page. pixzer did not substitute a placeholder list for private library data."
        />
      ) : library.games.length === 0 ? (
        <Notice
          title="Your private library is ready for your games"
          body="Nothing has been uploaded yet. Choose “Add a game” to send a supported file directly to private storage."
        />
      ) : (
        <section aria-labelledby="stored-games-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold" id="stored-games-heading">Stored games</h2>
              <p className="mt-1 text-sm text-muted">Each file was confirmed in private storage.</p>
            </div>
            <span className="text-xs text-subtle">Player integration pending</span>
          </div>
          <ul className="space-y-3">
            {library.games.map((game) => (
              <li className="panel flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" key={game.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-base font-semibold">{game.title}</h3>
                    {game.isFavorite && <span className="text-xs text-accent">Favorite</span>}
                  </div>
                  <p className="mt-1 break-all text-xs text-muted">{game.fileName}</p>
                  <p className="mt-2 text-xs text-subtle">
                    {consoleNames[game.console]} · {formatSize(game.sizeBytes)} · {game.storageProvider === "google_drive" ? "Google Drive" : "Cloudflare R2"} · Stored {new Date(game.createdAt).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                  <span className="rounded-full border border-token px-3 py-1.5 text-xs text-muted">Stored · not playable yet</span>
                  <a
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-token bg-surface-soft px-4 text-sm font-semibold hover:bg-surface-raised"
                    href={`/api/games/${encodeURIComponent(game.id)}/download`}
                  >
                    Download original
                  </a>
                  {game.storageProvider === "google_drive" && (
                    <DeleteDriveGameButton gameId={game.id} title={game.title} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-8 -mx-5 sm:-mx-6">
        <ConsolePlatformShowcase
          heading="A closer look at the hardware."
          description="Stylized illustrations of pixzer's planned platforms. Compatibility testing is still in progress; no games are shown here."
        />
      </div>
    </AppShell>
  );
}
