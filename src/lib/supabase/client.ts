"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

let browserClient: SupabaseClient | undefined;

/** Create one PKCE browser client backed by the shared SSR cookie session. */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("pixzer authentication is not configured yet.");
  }

  browserClient = createBrowserClient(config.url, config.publishableKey, {
    auth: { flowType: "pkce" },
  });

  return browserClient;
}
