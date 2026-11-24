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
