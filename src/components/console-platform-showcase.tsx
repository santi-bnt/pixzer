import Image from "next/image";

type ConsoleId = "gb" | "gbc" | "gba" | "nds" | "n64";

const platforms: {
  id: ConsoleId;
  name: string;
  kind: string;
  description: string;
  image: string;
}[] = [
  {
    id: "gb",
    name: "Game Boy",
    kind: "Original handheld",
    description: "The original monochrome handheld, shown with its classic controls.",
    image: "/console-hardware/game-boy.webp",
  },
  {
    id: "gbc",
    name: "Game Boy Color",
    kind: "Color handheld",
    description: "A rounded transparent shell and the first color Game Boy display.",
    image: "/console-hardware/game-boy-color.webp",
  },
  {
    id: "gba",
    name: "Game Boy Advance",
    kind: "Landscape handheld",
    description: "A wide screen framed by the original Advance controls.",
    image: "/console-hardware/game-boy-advance.webp",
  },
  {
    id: "nds",
    name: "Nintendo DS",
    kind: "Dual-screen handheld",
    description: "The open clamshell design, with both screens and controls visible.",
    image: "/console-hardware/nintendo-ds.webp",
  },
  {
    id: "n64",
    name: "Nintendo 64",
    kind: "Home console",
    description: "The rounded console and its distinctive three-grip controller.",
    image: "/console-hardware/nintendo-64.webp",
  },
];

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
              <div className="relative grid h-52 place-items-center overflow-hidden rounded-[1.25rem] bg-surface-soft sm:h-56">
                <Image
                  alt=""
                  aria-hidden="true"
                  className="object-contain p-2"
                  fill
                  sizes="(max-width: 640px) 78vw, (max-width: 1280px) 30vw, 20vw"
                  src={platform.image}
                />
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
