import { createGameDownloadUrl } from "@/lib/r2/storage-service";
import { createR2Client, getR2ServerConfig } from "@/lib/r2/server";
import { isOwnedGameObjectKey, isValidUploadId } from "@/lib/r2/upload-validation.mjs";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedUser } from "@/lib/supabase/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const user = await getAuthorizedUser();
  if (!user) {
    return new Response(null, {
      status: 401,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  const { gameId } = await context.params;
  if (!isValidUploadId(gameId)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }

  const r2Config = getR2ServerConfig();
  if (!r2Config || process.env.PIXZER_R2_UPLOADS_ENABLED !== "true") {
    return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("games")
      .select("id, user_id, file_name, object_key")
      .eq("id", gameId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (
      error ||
      !data ||
      data.user_id !== user.id ||
      !isOwnedGameObjectKey(data.object_key, user.id)
    ) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }

    const url = await createGameDownloadUrl(
      createR2Client(r2Config),
      r2Config,
      data.object_key,
      data.file_name,
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
