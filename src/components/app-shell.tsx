import type { ReactNode } from "react";
import { Brand } from "@/components/ui";

const nav = [
  ["Overview", "/library", "⌂"],
  ["My library", "/library", "▦"],
  ["Add a game", "/upload", "＋"],
  ["Settings", "/settings", "⚙"],
] as const;

export function AppShell({
  children,
  active = "Overview",
}: {
  children: ReactNode;
  active?: string;
}) {
  return (
    <div className="min-h-screen bg-[#101116] text-[#f5f5f7]">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r border-white/[.07] bg-[#14151c] px-5 py-6 lg:flex">
        <a href="/library" aria-label="PocketArcade home">
          <Brand />
        </a>
        <div className="mt-12 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-[#707384]">
          Workspace
        </div>
        <nav className="mt-3 space-y-1">
          {nav.map(([label, href, icon]) => (
            <a
              key={label}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active === label ? "bg-violet-300/10 font-semibold text-violet-200" : "text-[#a5a8b8] hover:bg-white/[.04] hover:text-white"}`}
            >
              <span className="w-5 text-center text-lg">{icon}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-violet-200/10 bg-violet-300/[.06] p-4">
          <div className="text-xs font-semibold text-violet-100">
            A little space to play
          </div>
          <p className="mt-2 text-xs leading-5 text-[#a5a8b8]">
            Your private library is being prepared. Connect your account in a
            future release.
          </p>
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-white/[.07] pt-5">
          <span className="grid size-9 place-items-center rounded-full bg-[#303240] text-sm">
            PA
          </span>
          <div>
            <div className="text-xs font-semibold">Guest session</div>
            <div className="text-[11px] text-[#808394]">Not signed in</div>
          </div>
          <a href="/login" className="ml-auto text-xs text-violet-200">
            Sign in
          </a>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="flex h-16 items-center justify-between border-b border-white/[.07] px-5 sm:px-8">
          <div className="lg:hidden">
            <a href="/library">
              <Brand />
            </a>
          </div>
          <div className="hidden text-sm text-[#888b9c] lg:block">
            Your games, close at hand.
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-lg border border-white/10 px-3 py-2 text-xs text-[#9da0af] sm:inline-flex">
              Private library
            </span>
            <a
              href="/settings"
              className="grid size-9 place-items-center rounded-full border border-white/10 text-sm"
              aria-label="Settings"
            >
              ⚙
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-white/10 bg-[#14151c]/95 px-2 py-2 backdrop-blur lg:hidden">
        {nav.slice(0, 4).map(([label, href, icon]) => (
          <a
            key={label}
            href={href}
            className="flex min-w-16 flex-col items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-[#a5a8b8]"
          >
            <span className="text-lg">{icon}</span>
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}
