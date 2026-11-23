import type { ReactNode } from "react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3 font-semibold tracking-tight">
      <span className="grid size-9 place-items-center rounded-xl bg-violet-400 text-lg text-[#17131f] shadow-[0_6px_24px_rgba(152,120,245,.3)]">
        ◈
      </span>
      {!compact && (
        <span>
          Pocket<span className="text-violet-300">Arcade</span>
        </span>
      )}
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
      ? "bg-violet-300 text-[#17131f] hover:bg-violet-200"
      : variant === "secondary"
        ? "border border-white/10 bg-white/[.06] text-white hover:bg-white/10"
        : "text-[#b8b8c7] hover:bg-white/[.06] hover:text-white";
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
      <div className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-violet-300">
        {eyebrow}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      {children && (
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a5a8b8]">
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
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-200">
          ✦
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#a5a8b8]">{body}</p>
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
    <div className="panel group rounded-2xl p-3 transition hover:-translate-y-1 hover:border-violet-300/30">
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
          <p className="mt-1 text-xs text-[#a5a8b8]">
            Your library will live here
          </p>
        </div>
        <span className="grid size-9 place-items-center rounded-full bg-white/[.06] text-[#d6caff]">
          ↗
        </span>
      </div>
    </div>
  );
}
