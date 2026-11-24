import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

/** Server-only client for the narrowly granted upload RPCs. Never pass to a client component. */
export function createPrivilegedSupabaseClient() {
  const config = getSupabasePublicConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secretKey) return null;

  return createClient(config.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function hasPrivilegedSupabaseConfig(): boolean {
  return Boolean(
    getSupabasePublicConfig() && process.env.SUPABASE_SECRET_KEY,
  );
}
