import type { ReactNode } from "react";
import Image from "next/image";

export function Brand() {
  return (
    <span className="inline-flex shrink-0 items-center">
      <Image
        src="/brand/pixzer-logo-tv-vacia-negro.png"
        alt="pixzer — Your Games Anywhere."
        width={1040}
        height={422}
        sizes="(max-width: 639px) 108px, 157px"
        className="brand-logo brand-logo--light h-11 w-auto max-w-full object-contain sm:h-16"
        preload
      />
      <Image
        src="/brand/pixzer-logo-tv-vacia-blanco.png"
        alt="pixzer — Your Games Anywhere."
        width={1040}
        height={422}
        sizes="(max-width: 639px) 108px, 157px"
        className="brand-logo brand-logo--dark h-11 w-auto max-w-full object-contain sm:h-16"
        preload
      />
    </span>
  );
}

export function Button({
  children,
  href,
  variant = "primary",
  disabled = false,
}: {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}) {
  const style =
    variant === "primary"
      ? "bg-accent text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
      : variant === "secondary"
        ? "border border-token bg-surface-soft text-text hover:bg-surface-raised"
        : "text-muted hover:bg-surface-soft hover:text-text";
  const klass = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${style} ${disabled ? "cursor-not-allowed opacity-45" : ""}`;
  if (href && !disabled)
    return (
      <a className={klass} href={href}>
        {children}
      </a>
    );
  return (
    <button className={klass} disabled={disabled} type="button">
      {children}
    </button>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-accent">
        {eyebrow}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      {children && (
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          {children}
        </p>
      )}
    </div>
  );
}

export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel rounded-2xl p-5">
      <div className="flex gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
          ✦
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
        </div>
      </div>
    </div>
  );
}

export function GameTile({
  title,
  code,
  color,
}: {
  title: string;
  code: string;
  color: string;
}) {
  return (
    <div className="panel group rounded-2xl p-3 transition hover:-translate-y-1 hover:border-accent/40">
      <div
        className={`relative grid aspect-[1.35] place-items-center overflow-hidden rounded-xl ${color}`}
      >
        <span
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 35%,white 0 1px,transparent 2px),radial-gradient(circle at 75% 62%,white 0 1px,transparent 2px)",
            backgroundSize: "31px 29px",
          }}
        />
        <span className="relative rounded-lg border border-white/25 bg-black/20 px-3 py-2 text-3xl">
          {code}
        </span>
        <span className="absolute bottom-3 left-3 rounded-md bg-black/25 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white/80">
          Concept art
        </span>
      </div>
      <div className="flex items-center justify-between px-1 pt-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted">Your library will live here</p>
        </div>
        <span className="grid size-9 place-items-center rounded-full bg-surface-raised text-accent">
          ↗
        </span>
      </div>
    </div>
  );
}
