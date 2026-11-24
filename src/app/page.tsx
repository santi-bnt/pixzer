import { Brand, Button } from "@/components/ui";
import { ConsolePlatformShowcase } from "@/components/console-platform-showcase";
import { AppearanceSelect } from "@/features/appearance/theme-provider";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="hero-glow min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-4 sm:gap-3 sm:px-6 sm:py-5">
        <Link href="/" aria-label="pixzer home">
          <Brand />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-5">
          <AppearanceSelect compact />
          <a className="quiet-link hidden text-sm sm:inline" href="#how-it-works">
            How it works
          </a>
          <a className="quiet-link hidden text-sm sm:inline" href="/login">
            Sign in
          </a>
          <Button href="/register">
            Get started <span aria-hidden="true">↗</span>
          </Button>
        </nav>
      </header>

      <section className="mx-auto flex min-h-[62vh] max-w-7xl items-center justify-center px-6 pb-14 pt-10 text-center sm:pb-20">
        <div className="max-w-4xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-accent">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
            A personal library for your games
          </div>
          <h1 className="mx-auto max-w-3xl text-5xl font-semibold leading-[1.06] tracking-[-.055em] sm:text-7xl">
            Your games.
            <br />
            <span className="text-accent">Your little</span>
            <br />
            corner of play.
          </h1>
          <p className="mx-auto mt-7 max-w-lg text-base leading-7 text-muted">
            Keep your legally obtained retro games in one private library and
            play in your desktop browser. pixzer is in early development.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/register">Create your account</Button>
            <Button href="#how-it-works" variant="secondary">
              See what is planned
            </Button>
          </div>
          <p className="mt-5 text-xs text-subtle">
            Invited community · Your files stay yours
          </p>
        </div>
      </section>

      <ConsolePlatformShowcase
        id="how-it-works"
        heading="Five classics. One private library."
        description="Illustrative hardware for pixzer's platform targets. These are console renders, not games in your library; gameplay compatibility is still being validated."
      />

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-14">
        <div className="max-w-xl">
          <div className="text-xs font-bold uppercase tracking-[.2em] text-accent">
            Built around ownership
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Your collection, on your terms.
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            pixzer is designed for games you own and files you are legally
            allowed to use. No bundled ROMs or firmware.
          </p>
        </div>
      </section>

      <footer className="border-t border-token px-6 py-6 text-center text-xs text-subtle">
        pixzer · Early access foundation · No games or firmware included
      </footer>
    </main>
  );
}
