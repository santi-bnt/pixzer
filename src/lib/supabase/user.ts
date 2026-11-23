import "server-only";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AuthorizedUser = { id: string; email: string | null };

/** Verify the Auth user and require Supabase's trusted invitation marker. */
export async function getAuthorizedUser(): Promise<AuthorizedUser | null> {
  if (!getSupabasePublicConfig()) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    const user = error ? null : data.user;

    if (!user || !user.invited_at) return null;

    return {
      id: user.id,
      email: user.email ?? null,
    };
  } catch {
    return null;
  }
}
