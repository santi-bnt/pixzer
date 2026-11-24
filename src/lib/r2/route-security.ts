import "server-only";

export function isSameOriginMutation(request: Request): boolean {
  const suppliedOrigin = request.headers.get("origin");
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!suppliedOrigin || !configuredSiteUrl) return false;

  try {
    const supplied = new URL(suppliedOrigin);
    const configured = new URL(configuredSiteUrl);
    if (
      supplied.origin === configured.origin &&
      supplied.username === "" &&
      supplied.password === ""
    ) {
      return true;
    }

    const vercelUrl = process.env.VERCEL_URL;
    return Boolean(
      vercelUrl &&
        supplied.origin === new URL(`https://${vercelUrl}`).origin &&
        supplied.username === "" &&
        supplied.password === "",
    );
  } catch {
    return false;
  }
}

export function privateJson(
  payload: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie, Origin",
    },
  });
}

export function isJsonRequest(request: Request): boolean {
  return request.headers.get("content-type")?.split(";")[0]?.trim() === "application/json";
}
