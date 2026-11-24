type ConsoleId = "gb" | "gbc" | "gba" | "nds" | "n64";

const platforms: {
  id: ConsoleId;
  name: string;
  kind: string;
  description: string;
}[] = [
  {
    id: "gb",
    name: "Game Boy",
    kind: "HANDHELD",
    description: "The pocket-sized original.",
  },
  {
    id: "gbc",
    name: "Game Boy Color",
    kind: "HANDHELD",
    description: "A little more color in your hands.",
  },
  {
    id: "gba",
    name: "Game Boy Advance",
    kind: "HANDHELD",
    description: "A wider screen for bigger adventures.",
  },
  {
    id: "nds",
    name: "Nintendo DS",
    kind: "DUAL SCREEN",
    description: "Two displays, one distinctive design.",
  },
  {
    id: "n64",
    name: "Nintendo 64",
    kind: "HOME CONSOLE",
    description: "A living-room classic built for four.",
  },
];

function GameBoyIllustration({ color }: { color: boolean }) {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210">
      <path
        d="M71 12h98c8 0 13 5 14 13l15 150c1 11-5 18-16 20l-113 4c-11 0-18-6-19-17L37 34c-1-13 5-21 18-22z"
        fill="var(--surface)"
        stroke="var(--line-strong)"
        strokeWidth="2.5"
      />
      <path
        d="M61 24h116l10 103-135 2z"
        fill="var(--background-secondary)"
        stroke="var(--line)"
        strokeWidth="2"
      />
      <rect x="67" y="31" width="104" height="86" rx="4" fill="#17171b" />
      <path d="M79 99h80" stroke="var(--accent)" strokeLinecap="round" strokeWidth="3" />
      {color && (
        <>
          <circle cx="94" cy="69" r="9" fill="var(--accent)" opacity=".95" />
          <circle cx="122" cy="57" r="8" fill="var(--accent)" opacity=".62" />
          <circle cx="143" cy="77" r="7" fill="var(--muted)" opacity=".8" />
        </>
      )}
      <path d="M65 148h38v12H89v14H77v-14H65z" fill="var(--text)" />
      <circle cx="152" cy="155" r="12" fill="var(--accent)" />
      <circle cx="177" cy="143" r="12" fill="var(--text)" />
      <rect x="112" y="176" width="22" height="5" rx="2.5" fill="var(--muted)" />
      <rect x="142" y="175" width="22" height="5" rx="2.5" fill="var(--muted)" />
      <circle cx="54" cy="145" r="3" fill="var(--accent)" />
    </svg>
  );
}

function AdvanceIllustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210">
      <path
        d="M29 63c0-10 8-18 18-19l146-6c12 0 20 8 21 19l6 91c1 11-6 19-17 20l-159 6c-11 0-19-7-20-18z"
        fill="var(--surface)"
        stroke="var(--line-strong)"
        strokeWidth="2.5"
      />
      <path d="M73 52l111-4 4 60-112 4z" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <rect x="81" y="58" width="96" height="48" rx="3" fill="#17171b" />
      <path d="M91 94h76" stroke="var(--accent)" strokeLinecap="round" strokeWidth="3" />
      <path d="M39 120h38v12H63v14H51v-14H39z" fill="var(--text)" />
      <circle cx="163" cy="126" r="12" fill="var(--accent)" />
      <circle cx="188" cy="115" r="12" fill="var(--text)" />
      <rect x="94" y="143" width="23" height="5" rx="2.5" fill="var(--muted)" />
      <rect x="125" y="142" width="23" height="5" rx="2.5" fill="var(--muted)" />
      <path d="M104 162h31" stroke="var(--line-strong)" strokeLinecap="round" strokeWidth="2" />
      <circle cx="47" cy="77" r="3" fill="var(--accent)" />
    </svg>
  );
}

function DualScreenIllustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210">
      <path
        d="M48 20c1-9 8-15 17-15h110c9 0 16 6 17 15l5 70c1 9-6 15-15 16l-123 5c-10 0-17-6-17-16z"
        fill="var(--surface)"
        stroke="var(--line-strong)"
        strokeWidth="2.5"
      />
      <path d="M65 18h110l4 65-109 5z" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <rect x="72" y="25" width="96" height="51" rx="3" fill="#17171b" />
      <path d="M82 64h76" stroke="var(--accent)" strokeLinecap="round" strokeWidth="3" />
      <path d="M37 106c0-9 7-15 16-15h134c10 0 17 6 17 15l-4 79c0 9-8 15-17 15H55c-10 0-17-6-17-15z"
        fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <rect x="69" y="106" width="102" height="47" rx="3" fill="#17171b" />
      <path d="M79 141h82" stroke="var(--accent)" strokeLinecap="round" strokeWidth="3" />
      <path d="M54 159h29v9H74v10h-9v-10H54z" fill="var(--text)" />
      <circle cx="159" cy="166" r="8" fill="var(--accent)" />
      <circle cx="177" cy="158" r="8" fill="var(--text)" />
      <path d="M101 184h31" stroke="var(--muted)" strokeLinecap="round" strokeWidth="3" />
      <path d="M49 97h141" stroke="var(--accent)" strokeLinecap="round" strokeWidth="2" opacity=".8" />
    </svg>
  );
}

function HomeConsoleIllustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210">
      <path
        d="M55 38 163 25c10-1 18 4 22 13l28 55c4 9 0 17-9 20l-107 35c-10 3-18 0-23-9L37 69c-5-12 2-28 18-31z"
        fill="var(--surface)"
        stroke="var(--line-strong)"
        strokeWidth="2.5"
      />
      <path d="m55 48 105-12 25 49-102 31z" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <path d="m82 51 65-8 6 13-65 9z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="m92 113 102-31 13 18c3 5 1 10-5 12l-106 35z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2" />
      <circle cx="116" cy="133" r="3.5" fill="var(--accent)" />
      <circle cx="130" cy="129" r="3.5" fill="var(--accent)" />
      <circle cx="144" cy="125" r="3.5" fill="var(--accent)" />
      <circle cx="158" cy="121" r="3.5" fill="var(--accent)" />
      <path d="M66 171c0-7 5-12 12-12h83c7 0 12 5 12 12v14c0 7-5 12-12 12h-83c-7 0-12-5-12-12z" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="M82 171h26v6H99v9h-7v-9h-10z" fill="var(--text)" />
      <circle cx="146" cy="176" r="5" fill="var(--accent)" />
      <circle cx="160" cy="183" r="5" fill="var(--text)" />
      <path d="M113 185h16" stroke="var(--muted)" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function ConsoleIllustration({ id }: { id: ConsoleId }) {
  if (id === "gba") return <AdvanceIllustration />;
  if (id === "nds") return <DualScreenIllustration />;
  if (id === "n64") return <HomeConsoleIllustration />;
  return <GameBoyIllustration color={id === "gbc"} />;
}

export function ConsolePlatformShowcase({
  id,
  heading,
  description,
}: {
  id?: string;
  heading: string;
  description: string;
}) {
  return (
    <section
      aria-labelledby={`${id ?? "platforms"}-heading`}
      className="mx-auto max-w-7xl border-t border-token px-5 py-14 sm:px-6 sm:py-16"
      id={id}
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 sm:mb-9">
        <div className="max-w-2xl">
          <div className="text-xs font-bold uppercase tracking-[.2em] text-accent">
            Illustrative platform targets
          </div>
          <h2
            className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
            id={`${id ?? "platforms"}-heading`}
          >
            {heading}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
        </div>
        <span className="rounded-full border border-token bg-surface-soft px-3 py-2 text-xs font-medium text-muted">
          Compatibility testing pending
        </span>
      </div>

      <div
        aria-label="Illustrations of pixzer platform targets"
        className="-mx-5 overflow-x-auto overscroll-x-contain px-5 pb-3 focus-visible:rounded-2xl sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0"
        role="region"
        tabIndex={0}
      >
        <ul className="flex snap-x snap-mandatory gap-3 sm:gap-4 lg:gap-3 xl:gap-4">
          {platforms.map((platform, index) => (
            <li
              className="panel w-[min(76vw,17rem)] shrink-0 snap-start rounded-3xl p-3 sm:w-[min(42vw,17rem)] lg:w-auto lg:flex-1 lg:p-3.5"
              key={platform.id}
            >
              <div className="grid h-48 place-items-center overflow-hidden rounded-[1.25rem] bg-surface-soft sm:h-52">
                <ConsoleIllustration id={platform.id} />
              </div>
              <div className="px-1 pb-1 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[.16em] text-accent">
                    {platform.kind}
                  </span>
                  <span className="text-[10px] tabular-nums text-subtle">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-2 min-h-10 text-sm font-semibold leading-5 text-text">
                  {platform.name}
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {platform.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-xs text-subtle lg:hidden">
        Swipe to explore all five platforms.
      </p>
    </section>
  );
}
