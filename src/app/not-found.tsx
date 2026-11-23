import { Brand, Button } from "@/components/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid-glow grid min-h-screen place-items-center px-6">
      <div className="max-w-lg text-center">
        <Link className="inline-block" href="/">
          <Brand />
        </Link>
        <div className="mt-12 text-xs font-bold uppercase tracking-[.25em] text-violet-300">
          404 · Off the map
        </div>
        <h1 className="mt-4 text-5xl font-semibold">This shelf is empty.</h1>
        <p className="mt-4 text-sm leading-6 text-[#a5a8b8]">
          That page isn’t part of the library. Let’s get you back to a familiar
          place.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Button href="/">Go home</Button>
          <Button href="/library" variant="secondary">
            Open library
          </Button>
        </div>
      </div>
    </main>
  );
}
