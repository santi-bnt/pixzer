const oauthErrorCodes = [
  "google-unavailable",
  "oauth-failed",
  "google-access-denied",
  "google-redirect-mismatch",
  "google-email-unverified",
  "google-provider-misconfigured",
  "oauth-session-failed",
  "oauth-callback-failed",
  "invite-required",
  "invalid-link",
  "auth-unavailable",
];

export function parseOAuthError(value) {
  return oauthErrorCodes.find((code) => code === value);
}

export function mapOAuthProviderError(error, errorCode) {
  const safeCode = typeof errorCode === "string" ? errorCode.toLowerCase() : "";
  const safeError = typeof error === "string" ? error.toLowerCase() : "";
  if (["signup_disabled", "user_not_found"].includes(safeCode) || ["signup_disabled", "user_not_found"].includes(safeError)) {
    return "invite-required";
  }
  if (["provider_email_needs_verification", "email_not_confirmed"].includes(safeCode) ||
      ["provider_email_needs_verification", "email_not_confirmed"].includes(safeError)) {
    return "google-email-unverified";
  }
  if (["provider_disabled", "invalid_client", "unauthorized_client"].includes(safeCode) ||
      ["provider_disabled", "invalid_client", "unauthorized_client"].includes(safeError)) {
    return "google-provider-misconfigured";
  }
  if (safeCode === "flow_state_expired" || safeCode === "bad_oauth_state" || safeCode === "flow_state_not_found") {
    return "oauth-session-failed";
  }
  if (safeCode === "redirect_uri_mismatch" || safeError === "redirect_uri_mismatch") {
    return "google-redirect-mismatch";
  }
  if (safeCode === "access_denied" || safeError === "access_denied") {
    return "google-access-denied";
  }
  if (safeCode === "temporarily_unavailable" || safeError === "temporarily_unavailable" || safeCode === "server_error" || safeError === "server_error") {
    return "google-unavailable";
  }
  return "oauth-failed";
}

export function mapOAuthCodeExchangeError(errorCode) {
  const safeCode = typeof errorCode === "string" ? errorCode.toLowerCase() : "";
  if (["flow_state_expired", "flow_state_not_found", "bad_code_verifier", "invalid_grant"].includes(safeCode)) {
    return "oauth-session-failed";
  }
  return "oauth-callback-failed";
}

export function mapOAuthFragmentError(fragment) {
  const params = new URLSearchParams(typeof fragment === "string" ? fragment.replace(/^#/, "") : "");
  const error = params.get("error");
  const errorCode = params.get("error_code");
  if (!error && !errorCode) return null;
  return mapOAuthProviderError(error, errorCode);
}

export function buildSupabaseGoogleOAuthOptions(redirectTo) {
  return {
    redirectTo,
    queryParams: { prompt: "select_account" },
    skipBrowserRedirect: true,
  };
}

export function getOAuthErrorMessage(code) {
  switch (code) {
    case "google-access-denied":
      return "Google did not authorize this sign-in. If pixzer is in Testing mode, ask the administrator to add your Google account as a test user.";
    case "google-redirect-mismatch":
      return "Google sign-in has a callback configuration mismatch. Please contact the pixzer administrator.";
    case "google-email-unverified":
      return "Google could not verify this email address. Verify the email with Google, then try again with the invited address.";
    case "google-provider-misconfigured":
      return "Google sign-in is not configured correctly. Please contact the pixzer administrator.";
    case "oauth-session-failed":
      return "The Google sign-in session expired or could not be verified. Start again and choose your account.";
    case "oauth-callback-failed":
      return "pixzer could not complete the Google sign-in callback. Start again; if it continues, contact the administrator.";
    case "google-unavailable":
      return "Google did not complete the sign-in request. Try again or use email and password.";
    case "invite-required":
      return "This account does not have access to pixzer yet. Use an invited account or contact your administrator.";
    case "invalid-link":
      return "This sign-in link is invalid or expired. Request a fresh invitation or recovery link.";
    case "auth-unavailable":
      return "Authentication is temporarily unavailable. Please try again later.";
    default:
      return "Google sign-in could not be completed. Try again or use email and password.";
  }
}
