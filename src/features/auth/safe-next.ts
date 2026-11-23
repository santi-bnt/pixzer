const DEFAULT_SIGNED_IN_PATH = "/library";

/** Accept only a local path; reject protocol-relative, backslash, and encoded separators. */
export function safeNextPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return DEFAULT_SIGNED_IN_PATH;
  }

  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("\\")) {
      return DEFAULT_SIGNED_IN_PATH;
    }
    const target = new URL(value, "https://pocketarcade.invalid");
    if (target.origin !== "https://pocketarcade.invalid") {
      return DEFAULT_SIGNED_IN_PATH;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return DEFAULT_SIGNED_IN_PATH;
  }
}
