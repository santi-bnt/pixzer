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
    // PKCE callbacks are exchanged by /auth/confirm. Fragment sessions from
    // Supabase's default email templates are consumed explicitly by the bridge.
    auth: { flowType: "pkce", detectSessionInUrl: false },
  });

  return browserClient;
}
