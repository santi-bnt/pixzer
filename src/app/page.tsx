import { Brand, Button } from "@/components/ui";
import Link from "next/link";

const systems = [
  "Game Boy",
  "Game Boy Color",
  "Game Boy Advance",
  "Nintendo DS",
  "Nintendo 64",
];

export default function HomePage() {
  return (
    <main className="grid-glow min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/">
          <Brand />
        </Link>
        <nav className="flex items-center gap-5">
          <a
            className="quiet-link hidden text-sm sm:inline"
            href="#how-it-works"
          >
            How it works
          </a>
          <a className="quiet-link text-sm" href="/login">
            Sign in
          </a>
          <Button href="/register">
            Get started <span>↗</span>
          </Button>
        </nav>
      </header>
      <section className="mx-auto grid min-h-[75vh] max-w-7xl items-center gap-10 px-6 pb-14 pt-10 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-violet-200/15 bg-violet-300/[.07] px-3 py-2 text-xs text-violet-100">
            <span className="size-1.5 rounded-full bg-emerald-300" />A personal
            library for your games
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.06] tracking-[-.055em] sm:text-7xl">
            Your games.
            <br />
            <span className="bg-gradient-to-r from-violet-200 to-[#9878f5] bg-clip-text text-transparent">
              Your little
            </span>
            <br />
            corner of play.
          </h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-[#a5a8b8]">
            Keep your legally obtained retro games in one private library and
            play in your desktop browser. PocketArcade is in early development.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/register">
              Create your account <span>→</span>
            </Button>
            <Button href="#how-it-works" variant="secondary">
              See what’s planned
            </Button>
          </div>
          <p className="mt-5 text-xs text-[#777a8a]">
            Invited community · Your files stay yours
          </p>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-8 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="panel relative rotate-1 rounded-[2rem] p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="text-xs text-[#8e91a1]">YOUR COLLECTION</div>
                <div className="mt-1 font-semibold">
                  A place for your favorites
                </div>
              </div>
              <span className="rounded-lg bg-violet-300/10 px-3 py-2 text-xs text-violet-100">
                Private
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex aspect-[1.25] items-end rounded-2xl bg-gradient-to-br from-[#454079] to-[#24243a] p-4">
                <span className="font-mono text-sm text-violet-100">
                  GAME BOY
                </span>
              </div>
              <div className="flex aspect-[1.25] items-end rounded-2xl bg-gradient-to-br from-[#34585a] to-[#1d3038] p-4">
                <span className="font-mono text-sm text-emerald-100">GBA</span>
              </div>
              <div className="flex aspect-[1.25] items-end rounded-2xl bg-gradient-to-br from-[#66503d] to-[#342820] p-4">
                <span className="font-mono text-sm text-amber-100">
                  NINTENDO DS
                </span>
              </div>
              <div className="flex aspect-[1.25] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[.02] text-3xl text-white/30">
                ＋
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-[#989baa]">
              <span className="size-2 rounded-full bg-amber-300" />
              Preview of the library experience
            </div>
          </div>
        </div>
      </section>
      <section
        id="how-it-works"
        className="mx-auto max-w-7xl border-t border-white/[.07] px-6 py-16"
      >
        <div className="max-w-xl">
          <div className="text-xs font-bold uppercase tracking-[.2em] text-violet-300">
            Built around ownership
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Your collection, on your terms.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#a5a8b8]">
            PocketArcade is designed for games you own and files you are legally
            allowed to use. No bundled ROMs or firmware.
          </p>
        </div>
        <div className="mt-9 flex flex-wrap gap-2">
          {systems.map((system) => (
            <span
              key={system}
              className="pill rounded-full px-4 py-2 text-xs text-[#c5c6d0]"
            >
              {system}
            </span>
          ))}
        </div>
      </section>
      <footer className="border-t border-white/[.07] px-6 py-6 text-center text-xs text-[#707384]">
        PocketArcade · Early access foundation · No games or firmware included
      </footer>
    </main>
  );
}
