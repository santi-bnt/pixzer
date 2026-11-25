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

function GameBoyIllustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210" fill="none">
      <path d="M76 8h88c9 0 15 7 16 16l8 153c1 15-7 24-22 25H73c-15-1-22-9-21-24l8-154c1-10 7-16 16-16Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <path d="M70 19h100" stroke="var(--line)" strokeWidth="2" />
      <rect x="72" y="26" width="96" height="77" rx="7" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <rect x="81" y="35" width="78" height="59" rx="3" fill="#232923" />
      <path d="M87 47h66M87 56h66M87 65h66M87 74h66M87 83h66" stroke="#A9C39F" strokeOpacity=".52" strokeWidth="1" />
      <rect x="91" y="56" width="18" height="5" rx="2.5" fill="#A9C39F" />
      <rect x="114" y="65" width="28" height="5" rx="2.5" fill="#C3D2B4" />
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

function GameBoyColorIllustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210" fill="none">
      <path d="M78 10h84c15 0 25 10 27 25l8 129c2 21-8 33-29 34H72c-20-1-29-13-27-33l8-131c1-14 10-24 25-24Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <path d="M69 26c2-7 7-11 15-11h72c8 0 13 4 15 11" stroke="var(--line)" strokeWidth="2" />
      <path d="M70 31h100c5 0 8 3 9 8l3 59H66l3-59c0-5 3-8 8-8Z" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <rect x="78" y="39" width="84" height="50" rx="3" fill="#263938" />
      <path d="M84 49h72M84 57h72M84 65h72M84 73h72M84 81h72" stroke="#8BB8AA" strokeOpacity=".48" strokeWidth="1" />
      <path d="M91 51h15v5H91z" fill="#E94B50" /><path d="M112 59h21v5h-21z" fill="#71B9D1" /><path d="M137 67h14v5h-14z" fill="#F3C46B" />
      <path d="M68 103h104" stroke="var(--line)" strokeWidth="1.5" />
      <path d="M76 133h34v10H98v12H88v-12H76z" fill="var(--text)" />
      <circle cx="148" cy="131" r="9" fill="var(--accent)" /><circle cx="163" cy="143" r="9" fill="var(--text)" />
      <circle cx="148" cy="131" r="12" stroke="var(--line-strong)" strokeWidth="1.5" /><circle cx="163" cy="143" r="12" stroke="var(--line-strong)" strokeWidth="1.5" />
      <path d="M93 169h18m17 0h18" stroke="var(--muted)" strokeLinecap="round" strokeWidth="4" />
      <g fill="var(--line-strong)"><circle cx="151" cy="169" r="1.4"/><circle cx="158" cy="167" r="1.4"/><circle cx="165" cy="165" r="1.4"/><circle cx="153" cy="175" r="1.4"/><circle cx="160" cy="173" r="1.4"/><circle cx="167" cy="171" r="1.4"/></g>
    </svg>
  );
}

function AdvanceIllustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210" fill="none">
      <g transform="translate(7 0) scale(.94 1)">
      <path d="M65 45c-13 1-21 10-21 23v53c0 12 7 19 19 22l16 4c8 2 14 0 20-5l7-7h28l7 7c6 5 12 7 20 5l16-4c12-3 19-10 19-22V68c0-13-8-22-21-23l-15-3H80l-15 3Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <path d="M68 49c2-5 6-8 12-8h80c6 0 10 3 12 8l4 42H64l4-42Z" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <rect x="73" y="55" width="94" height="32" rx="3" fill="#222923" />
      <path d="M80 62h80M80 69h80M80 76h80M80 83h80" stroke="#A6C39D" strokeOpacity=".38" strokeWidth="1" />
      <path d="M85 89h70" stroke="#A6C39D" strokeWidth="2" />
      <path d="M57 111h35v10H79v13H69v-13H57z" fill="var(--text)" />
      <circle cx="168" cy="108" r="9" fill="var(--accent)" stroke="var(--line-strong)" strokeWidth="1.5" /><circle cx="183" cy="120" r="9" fill="var(--text)" stroke="var(--line-strong)" strokeWidth="1.5" />
      <circle cx="168" cy="108" r="11" stroke="var(--line)" /><circle cx="183" cy="120" r="11" stroke="var(--line)" />
      <text x="168" y="111" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--accent-contrast)">A</text><text x="183" y="123" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--accent-contrast)">B</text>
      <path d="M99 121h17m13 0h17" stroke="var(--muted)" strokeLinecap="round" strokeWidth="4" />
      <path d="M57 52h12m102 0h12" stroke="var(--line-strong)" strokeLinecap="round" strokeWidth="3" />
      <circle cx="67" cy="107" r="2.5" fill="var(--accent)" />
      </g>
    </svg>
  );
}

function DualScreenIllustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210" fill="none">
      <path d="M68 8h104c13 0 21 8 22 21l4 54c1 13-7 21-20 22l-116 2c-13 0-20-8-20-20l3-58C46 16 54 8 68 8Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <rect x="72" y="18" width="96" height="68" rx="5" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <rect x="80" y="25" width="80" height="54" rx="2" fill="#252B29" />
      <path d="M86 37h68M86 46h68M86 55h68M86 64h68" stroke="#9FB9A1" strokeOpacity=".36" strokeWidth="1" /><path d="M88 73h64" stroke="#9FB9A1" strokeWidth="2" />
      <path d="M45 93h150" stroke="var(--line-strong)" strokeWidth="4" strokeLinecap="round" /><path d="M54 94v5m132-5v5" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="120" cy="95" r="2.5" fill="var(--accent)" />
      <path d="M48 105c1-9 8-15 17-16l110-2c10 0 17 6 18 16l3 69c1 11-6 18-17 18H61c-11 0-18-7-18-18l3-67Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <rect x="72" y="105" width="96" height="54" rx="4" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" /><rect x="80" y="112" width="80" height="40" rx="2" fill="#252B29" />
      <path d="M86 121h68M86 129h68M86 137h68" stroke="#9FB9A1" strokeOpacity=".34" strokeWidth="1" /><path d="M88 145h64" stroke="#9FB9A1" strokeWidth="2" />
      <path d="M54 166h30v8H72v11h-8v-11H54z" fill="var(--text)" /><circle cx="166" cy="166" r="6" fill="var(--accent)" /><circle cx="180" cy="159" r="5.5" fill="var(--text)" /><circle cx="180" cy="173" r="5.5" fill="var(--text)" /><circle cx="194" cy="166" r="6" fill="var(--accent)" />
      <circle cx="188" cy="185" r="2" fill="var(--line-strong)" />
    </svg>
  );
}

function N64Illustration() {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 240 210" fill="none">
      <ellipse cx="120" cy="98" rx="57" ry="8" fill="var(--line)" opacity=".45" />
      <path d="M69 17c0-7 5-11 12-11h78c7 0 12 4 12 11v9c12 2 20 11 21 23l3 29c1 14-7 22-21 23H66c-14-1-22-9-21-23l3-29c1-12 9-21 21-23v-9Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <path d="M78 19c0-3 2-5 5-5h74c3 0 5 2 5 5v11H78V19Z" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
      <path d="M71 33h98c7 0 12 5 13 12l2 28H56l2-28c1-7 6-12 13-12Z" fill="var(--background-secondary)" stroke="var(--line)" strokeWidth="2" />
      <path d="M80 40h80c4 0 7 3 7 7v19H73V47c0-4 3-7 7-7Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="1.5" />
      <path d="M88 47h64v12H88z" fill="var(--background-secondary)" stroke="var(--line)" />
      <circle cx="166" cy="49" r="3" fill="var(--accent)" /><path d="M81 79h78" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="M69 85h102" stroke="var(--line-strong)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="74" y="87" width="15" height="5" rx="2.5" fill="var(--muted)" /><rect x="96" y="87" width="15" height="5" rx="2.5" fill="var(--muted)" /><rect x="118" y="87" width="15" height="5" rx="2.5" fill="var(--muted)" /><rect x="140" y="87" width="15" height="5" rx="2.5" fill="var(--muted)" />
      <path d="M54 125c0-8 6-13 14-13h21c8 0 14 5 17 13l5 17 6-24c2-8 8-12 16-12h10c8 0 14 5 16 13l6 23 5-17c3-8 9-13 17-13h16c9 0 15 6 15 14 0 4-2 8-5 11l-15 15c-5 5-12 7-19 4l-22-9-8 22c-3 8-9 12-17 12h-9c-8 0-14-4-17-12l-8-22-22 9c-7 3-14 1-19-4l-15-15c-4-3-6-8-6-12Z" fill="var(--surface-raised)" stroke="var(--line-strong)" strokeWidth="2.5" />
      <path d="M61 126h24v8h-8v8h-8v-8h-8z" fill="var(--text)" />
      <circle cx="124" cy="130" r="12" fill="var(--background-secondary)" stroke="var(--line-strong)" strokeWidth="2" /><circle cx="124" cy="130" r="6" fill="var(--muted)" />
      <circle cx="172" cy="127" r="5.5" fill="var(--accent)" /><circle cx="186" cy="136" r="5.5" fill="var(--accent)" /><circle cx="172" cy="145" r="5.5" fill="var(--accent)" /><circle cx="158" cy="136" r="5.5" fill="var(--accent)" />
      <circle cx="147" cy="117" r="2.5" fill="var(--text)" /><circle cx="156" cy="117" r="2.5" fill="var(--text)" />
      <path d="M110 159h28l-4 7h-20z" fill="var(--muted)" />
    </svg>
  );
}

function ConsoleIllustration({ id }: { id: ConsoleId }) {
  if (id === "gb") return <GameBoyIllustration />;
  if (id === "gbc") return <GameBoyColorIllustration />;
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
