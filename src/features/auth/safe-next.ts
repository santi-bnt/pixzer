import { getSafeAuthNextPath } from "@/features/auth/fragment-flow.mjs";

const DEFAULT_SIGNED_IN_PATH = "/library";
const SAFE_ORIGIN = "https://pocketarcade.invalid";

/** Accept only a local path; reject protocol-relative, backslash, and encoded separators. */
export function safeNextPath(value: string | null | undefined): string {
  return getSafeAuthNextPath(value, SAFE_ORIGIN, DEFAULT_SIGNED_IN_PATH);
}
