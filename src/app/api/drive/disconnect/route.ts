import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/supabase/user";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { decryptRefreshToken, getGoogleDriveConfig, revokeDriveToken } from "@/lib/google-drive/server";
import { isJsonRequest, isSameOriginMutation } from "@/lib/r2/route-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "request-not-allowed" }, { status: 403 });
  if (!isJsonRequest(request)) return NextResponse.json({ error: "invalid-request" }, { status: 415 });
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "invited-account-required" }, { status: 401 });
  const supabase = createPrivilegedSupabaseClient();
  const config = getGoogleDriveConfig();
  if (!supabase) return NextResponse.json({ error: "drive-not-configured" }, { status: 503 });

  const { data } = await supabase.from("drive_connections")
    .select("refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag")
    .eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("drive_connections").update({
    refresh_token_ciphertext: null,
    refresh_token_nonce: null,
    refresh_token_tag: null,
    token_key_version: null,
    connected_at: null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "drive-disconnect-failed" }, { status: 503 });

  if (config && data?.refresh_token_ciphertext && data.refresh_token_nonce && data.refresh_token_tag) {
    try {
      const refreshToken = decryptRefreshToken(data, config.encryptionKey);
      await revokeDriveToken(refreshToken);
    } catch {
      // Local credentials are already removed; revocation can be repeated from the Google account UI.
    }
  }

  return NextResponse.json({ disconnected: true, filesPreserved: true }, {
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
