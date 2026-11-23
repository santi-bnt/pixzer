export const oauthErrorCodes = [
  "google-unavailable",
  "oauth-failed",
  "invite-required",
  "invalid-link",
  "auth-unavailable",
] as const;

export type OAuthErrorCode = (typeof oauthErrorCodes)[number];

const oauthErrorMessages: Record<OAuthErrorCode, string> = {
  "google-unavailable":
    "Google sign-in is unavailable right now. Try again or use email and password.",
  "oauth-failed":
    "Google sign-in could not be completed. Try again or use email and password.",
  "invite-required":
    "This account does not have access to pixzer yet. Use an invited account or contact your administrator.",
  "invalid-link":
    "This sign-in link is invalid or expired. Request a fresh invitation or recovery link.",
  "auth-unavailable":
    "Authentication is temporarily unavailable. Please try again later.",
};

export function parseOAuthError(
  value: string | undefined,
): OAuthErrorCode | undefined {
  return oauthErrorCodes.find((code) => code === value);
}

export function getOAuthErrorMessage(code: OAuthErrorCode): string {
  return oauthErrorMessages[code];
}
