/** Map a database decision to a non-cacheable, retryable route response. */
export function driveRateLimitResponse(result) {
  if (result.kind === "allowed") return null;
  const limited = result.kind === "limited";
  const retryAfter = limited ? result.retryAfterSeconds : 5;
  return Response.json(
    { error: limited ? "drive-rate-limit-exceeded" : "drive-rate-limit-unavailable" },
    {
      status: limited ? 429 : 503,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "Retry-After": String(retryAfter),
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
