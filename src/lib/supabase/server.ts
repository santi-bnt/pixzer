import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

/** Create a request-bound PKCE client that reads/writes the Supabase cookie session. */
export async function createClient(): Promise<SupabaseClient> {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("pixzer authentication is not configured yet.");
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    auth: { flowType: "pkce" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write response cookies; src/proxy.ts refreshes them.
        }
      },
    },
  });
}
