export type OAuthErrorCode =
  | "google-unavailable"
  | "oauth-failed"
  | "google-access-denied"
  | "google-redirect-mismatch"
  | "google-email-unverified"
  | "google-provider-misconfigured"
  | "oauth-session-failed"
  | "oauth-callback-failed"
  | "invite-required"
  | "invalid-link"
  | "auth-unavailable";

export function parseOAuthError(value: string | undefined): OAuthErrorCode | undefined;
export function mapOAuthProviderError(error: string | null, errorCode: string | null): OAuthErrorCode;
export function mapOAuthCodeExchangeError(errorCode: string | null): OAuthErrorCode;
export function mapOAuthFragmentError(fragment: string): OAuthErrorCode | null;
export function buildSupabaseGoogleOAuthOptions(redirectTo: string): {
  redirectTo: string;
  queryParams: { prompt: "select_account" };
  skipBrowserRedirect: true;
};
export function getOAuthErrorMessage(code: OAuthErrorCode): string;
