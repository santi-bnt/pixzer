export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

/** Returns public browser-safe settings, or null until the project is configured. */
export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;

  try {
    const parsedUrl = new URL(url);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      parsedUrl.hostname,
    );
    if (
      parsedUrl.protocol !== "https:" &&
      !(parsedUrl.protocol === "http:" && isLoopback)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { url, publishableKey };
}
