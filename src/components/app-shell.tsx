import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Brand } from "@/components/ui";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { getAuthorizedUser } from "@/lib/supabase/user";

const nav = [
  ["Overview", "/library", "⌂"],
  ["My library", "/library", "▦"],
  ["Add a game", "/upload", "＋"],
  ["Settings", "/settings", "⚙"],
] as const;

export async function AppShell({
  children,
  active = "Overview",
}: {
  children: ReactNode;
  active?: string;
}) {
  const user = await getAuthorizedUser();
  if (!user) {
    const requestHeaders = await headers();
    const pathname = requestHeaders.get("x-pocketarcade-pathname");
    const next =
      pathname?.startsWith("/") && !pathname.startsWith("//")
        ? pathname
        : "/library";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="min-h-screen bg-background text-text">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r border-token bg-background-secondary px-5 py-6 lg:flex">
        <a href="/library" aria-label="pixzer home">
          <Brand />
        </a>
        <div className="mt-12 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-subtle">
          Workspace
        </div>
        <nav className="mt-3 space-y-1">
          {nav.map(([label, href, icon]) => (
            <a
              key={label}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active === label ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:bg-surface-soft hover:text-text"}`}
            >
              <span className="w-5 text-center text-lg">{icon}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-accent/20 bg-accent/5 p-4">
          <div className="text-xs font-semibold text-accent">
            A little space to play
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            Your private library is linked to this account. Private uploads are
            available after storage setup is complete.
          </p>
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-token pt-5">
          <span className="grid size-9 place-items-center rounded-full bg-surface-raised text-sm">
            {user.email?.slice(0, 1).toUpperCase() ?? "PA"}
          </span>
          <div>
            <div className="max-w-36 truncate text-xs font-semibold">
              {user.email ?? "pixzer account"}
            </div>
            <div className="text-[11px] text-muted">Signed in</div>
          </div>
          <div className="ml-auto">
            <SignOutButton />
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="flex h-16 items-center justify-between border-b border-token px-5 sm:px-8">
          <div className="lg:hidden">
            <a href="/library">
              <Brand />
            </a>
          </div>
          <div className="hidden text-sm text-muted lg:block">
            Your games, close at hand.
          </div>
          <div className="flex items-center gap-3">
            <span className="max-w-36 truncate text-xs text-muted sm:hidden">
              {user.email}
            </span>
            <SignOutButton />
            <span className="hidden rounded-lg border border-token px-3 py-2 text-xs text-muted sm:inline-flex">
              Private library
            </span>
            <a
              href="/settings"
              className="grid size-9 place-items-center rounded-full border border-token text-sm"
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
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-token bg-background-secondary/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        {nav.slice(0, 4).map(([label, href, icon]) => (
          <a
            key={label}
            href={href}
            className="flex min-w-16 flex-col items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted"
          >
            <span className="text-lg">{icon}</span>
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}
