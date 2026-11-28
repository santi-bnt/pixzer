export type DriveRateLimitResponseInput =
  | { kind: "allowed"; remaining: number }
  | { kind: "limited"; retryAfterSeconds: number }
  | { kind: "unavailable" };

export function driveRateLimitResponse(result: DriveRateLimitResponseInput): Response | null;
