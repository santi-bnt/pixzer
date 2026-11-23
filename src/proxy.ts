import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

/** Refresh the cookie session before rendering; page authorization still verifies claims itself. */
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pocketarcade-pathname", request.nextUrl.pathname);
  const next = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  const config = getSupabasePublicConfig();
  if (!config) return next();

  let response = next();
  const supabase = createServerClient(config.url, config.publishableKey, {
    auth: { flowType: "pkce" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = next();
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(cacheHeaders ?? {}).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
