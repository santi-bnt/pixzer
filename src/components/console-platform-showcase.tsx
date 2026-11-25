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
    kind: "Original handheld",
    description: "Tall shell, monochrome screen, and the familiar two-button layout.",
  },
  {
    id: "gbc",
    name: "Game Boy Color",
    kind: "Color handheld",
    description: "The classic pocket silhouette, with a vivid color display.",
  },
  {
    id: "gba",
    name: "Game Boy Advance",
    kind: "Landscape handheld",
    description: "A wide screen framed by shoulder buttons and four face controls.",
  },
  {
    id: "nds",
    name: "Nintendo DS",
    kind: "Dual-screen handheld",
    description: "Two hinged displays with touch controls on the lower half.",
  },
  {
    id: "n64",
    name: "Nintendo 64",
    kind: "Home console",
    description: "A compact console paired with its distinctive three-grip controller.",
  },
];

function GameBoyIllustration({ color }: { color: boolean }) {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210" fill="none">
      <path d="M76 8h88c9 0 15 7 16 16l8 153c1 15-7 24-22 25H73c-15-1-22-9-21-24l8-154c1-10 7-16 16-16Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <path d="M70 19h100" stroke="var(--line)" strokeWidth="2" />
      <rect x="72" y="26" width="96" height="77" rx="7" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <rect x="81" y="35" width="78" height="59" rx="3" fill={color ? "#263938" : "#232923"} />
      {color ? (
        <>
          <path d="M87 47h66M87 56h66M87 65h66M87 74h66M87 83h66" stroke="#8BB8AA" strokeOpacity=".48" strokeWidth="1" />
          <rect x="91" y="47" width="13" height="5" rx="2.5" fill="#E94B50" />
          <rect x="108" y="56" width="19" height="5" rx="2.5" fill="#71B9D1" />
          <rect x="132" y="65" width="13" height="5" rx="2.5" fill="#F3C46B" />
        </>
      ) : (
        <>
          <path d="M87 47h66M87 56h66M87 65h66M87 74h66M87 83h66" stroke="#A9C39F" strokeOpacity=".52" strokeWidth="1" />
          <rect x="91" y="56" width="18" height="5" rx="2.5" fill="#A9C39F" />
          <rect x="114" y="65" width="28" height="5" rx="2.5" fill="#C3D2B4" />
        </>
      )}
      <path d="M76 115h88" stroke="var(--line)" strokeWidth="1.5" />
      <path d="M82 142h34v10h-12v12H94v-12H82z" fill="var(--text)" />
      <circle cx="148" cy="140" r="10" fill="var(--accent)" />
      <circle cx="164" cy="153" r="10" fill="var(--text)" />
      <circle cx="148" cy="140" r="13" stroke="var(--line-strong)" strokeWidth="1.5" />
      <circle cx="164" cy="153" r="13" stroke="var(--line-strong)" strokeWidth="1.5" />
      <text x="148" y="143" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--accent-contrast)">A</text>
      <text x="164" y="156" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--accent-contrast)">B</text>
      <rect x="94" y="177" width="21" height="5" rx="2.5" fill="var(--muted)" />
      <rect x="124" y="176" width="21" height="5" rx="2.5" fill="var(--muted)" />
      <g fill="var(--line-strong)">
        <circle cx="151" cy="178" r="1.5" /><circle cx="158" cy="176" r="1.5" /><circle cx="165" cy="174" r="1.5" />
        <circle cx="153" cy="184" r="1.5" /><circle cx="160" cy="182" r="1.5" /><circle cx="167" cy="180" r="1.5" />
      </g>
      <circle cx="69" cy="128" r="2.5" fill="var(--accent)" />
    </svg>
  );
}

function AdvanceIllustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210" fill="none">
      <path d="M31 56c4-10 13-16 25-17l126-8c13-1 22 5 25 18l13 74c3 15-4 26-19 29l-139 15c-15 2-25-5-29-19l-9-70c-1-8 1-15 7-22Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <path d="m63 48 116-7 8 57-115 10z" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <rect x="75" y="55" width="99" height="45" rx="3" fill="#222923" />
      <path d="M83 66h83M83 74h83M83 82h83M83 90h83" stroke="#A6C39D" strokeOpacity=".38" strokeWidth="1" />
      <path d="M92 60v31M104 60v31M116 60v31M128 60v31M140 60v31M152 60v31" stroke="#A6C39D" strokeOpacity=".22" strokeWidth="1" />
      <path d="M86 94h76" stroke="#A6C39D" strokeWidth="2" />
      <path d="M39 124h37v11H63v13H52v-13H39z" fill="var(--text)" />
      <circle cx="172" cy="119" r="11" fill="var(--accent)" stroke="var(--line-strong)" strokeWidth="2" />
      <circle cx="192" cy="132" r="11" fill="var(--text)" stroke="var(--line-strong)" strokeWidth="2" />
      <text x="172" y="122" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--accent-contrast)">A</text>
      <text x="192" y="135" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--accent-contrast)">B</text>
      <rect x="100" y="122" width="21" height="5" rx="2.5" fill="var(--muted)" />
      <rect x="128" y="120" width="21" height="5" rx="2.5" fill="var(--muted)" />
      <path d="m55 58 14-2M184 53l12-1" stroke="var(--line-strong)" strokeLinecap="round" strokeWidth="3" />
      <circle cx="56" cy="73" r="2.5" fill="var(--accent)" />
    </svg>
  );
}

function DualScreenIllustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210" fill="none">
      <path d="M64 8h112c11 0 18 7 19 18l5 64c1 11-7 19-18 20l-121 3c-11 0-18-7-18-18l3-68c0-12 7-19 18-19Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <rect x="73" y="20" width="94" height="67" rx="5" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <rect x="81" y="27" width="78" height="52" rx="2" fill="#252B29" />
      <path d="M87 39h66M87 48h66M87 57h66M87 66h66" stroke="#9FB9A1" strokeOpacity=".36" strokeWidth="1" />
      <path d="M89 73h62" stroke="#9FB9A1" strokeWidth="2" />
      <circle cx="120" cy="96" r="3" fill="var(--line-strong)" />
      <path d="M43 108c1-11 8-18 19-19l116-5c12-1 19 6 20 18l4 69c1 12-7 20-19 20H59c-12 0-19-8-19-20l3-63Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <rect x="73" y="103" width="94" height="55" rx="4" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <rect x="80" y="110" width="80" height="42" rx="2" fill="#252B29" />
      <path d="M86 120h68M86 128h68M86 136h68" stroke="#9FB9A1" strokeOpacity=".34" strokeWidth="1" />
      <path d="M88 145h64" stroke="#9FB9A1" strokeWidth="2" />
      <path d="M53 165h30v9H72v11h-9v-11H53z" fill="var(--text)" />
      <circle cx="164" cy="166" r="6" fill="var(--accent)" />
      <circle cx="179" cy="158" r="6" fill="var(--text)" />
      <circle cx="179" cy="174" r="6" fill="var(--text)" />
      <circle cx="194" cy="166" r="6" fill="var(--accent)" />
      <circle cx="192" cy="185" r="2" fill="var(--line-strong)" />
    </svg>
  );
}

function N64Illustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210" fill="none">
      <g transform="translate(-12 -15) scale(1.1 1.18)">
      <path d="M28 42c0-10 7-17 17-17h69c10 0 17 7 17 17v47c0 11-7 18-18 18H46c-11 0-18-7-18-18V42Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <path d="M39 37c0-4 3-7 7-7h67c4 0 7 3 7 7v40H39V37Z" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <rect x="66" y="38" width="28" height="5" rx="2.5" fill="var(--background-secondary)" stroke="var(--line)" />
      <path d="M39 83h92v11H39z" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <path d="M48 88v3M67 88v3M86 88v3M105 88v3M124 88v3" stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="113" cy="53" r="3" fill="var(--accent)" />
      <path d="M153 92c-4-9 1-18 10-20l11-3c9-2 16 3 20 12 4-9 11-14 20-11l8 2c9 2 13 11 10 20l-7 20c-3 8-10 11-17 7l-11-7-3 23c-1 9-9 14-17 9l-7-4-6-24-10 8c-8 6-16 1-19-8l-5-15c-3-9 4-16 13-9Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <path d="M153 96h24v8h-8v8h-8v-8h-8z" fill="var(--text)" />
      <circle cx="184" cy="112" r="7" fill="var(--muted)" stroke="var(--line-strong)" strokeWidth="1.5" />
      <path d="M205 96v14M198 103h14" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="218" cy="91" r="3.5" fill="var(--accent)" />
      <circle cx="226" cy="99" r="3.5" fill="var(--accent)" />
      <circle cx="217" cy="107" r="3.5" fill="var(--accent)" />
      <circle cx="209" cy="99" r="3.5" fill="var(--accent)" />
      <circle cx="193" cy="87" r="2.5" fill="var(--text)" />
      <circle cx="201" cy="89" r="2.5" fill="var(--text)" />
      <rect x="181" y="121" width="9" height="3" rx="1.5" fill="var(--muted)" />
      </g>
    </svg>
  );
}

function ConsoleIllustration({ id }: { id: ConsoleId }) {
  if (id === "gb") return <GameBoyIllustration color={false} />;
  if (id === "gbc") return <GameBoyIllustration color />;
  if (id === "gba") return <AdvanceIllustration />;
  if (id === "nds") return <DualScreenIllustration />;
  return <N64Illustration />;
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
      <div className="mb-7 flex flex-col gap-4 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
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
        <span className="self-start rounded-full border border-token bg-surface-soft px-3 py-2 text-xs font-medium text-muted sm:mb-1 sm:self-auto">
          Compatibility testing pending
        </span>
      </div>

      <div
        aria-label="Illustrations of pixzer platform targets"
        className="-mx-5 overflow-x-auto overscroll-x-contain px-5 pb-3 focus-visible:rounded-2xl sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0"
        role="region"
        tabIndex={0}
      >
        <ul className="flex snap-x snap-mandatory gap-3 sm:gap-4 lg:grid lg:grid-cols-3 lg:gap-4 xl:grid-cols-5">
          {platforms.map((platform) => (
            <li
              className="panel flex w-[min(82vw,19rem)] shrink-0 snap-start flex-col rounded-3xl p-3 sm:w-[min(46vw,19rem)] lg:w-auto lg:p-3.5"
              key={platform.id}
            >
              <div className="grid h-52 place-items-center overflow-hidden rounded-[1.25rem] bg-surface-soft sm:h-56">
                <ConsoleIllustration id={platform.id} />
              </div>
              <div className="flex flex-1 flex-col px-1 pb-1 pt-4">
                <span className="text-[10px] font-bold uppercase tracking-[.16em] text-accent">
                  {platform.kind}
                </span>
                <h3 className="mt-2 text-base font-semibold leading-5 text-text">
                  {platform.name}
                </h3>
                <p className="mt-2 flex-1 text-xs leading-5 text-muted">
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
