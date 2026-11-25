import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSupabaseGoogleOAuthOptions,
  getOAuthErrorMessage,
  mapOAuthProviderError,
  mapOAuthFragmentError,
  parseOAuthError,
} from "../../../src/features/auth/oauth-error-flow.mjs";

test("Google login explicitly asks for account selection without login_hint or consent prompt", () => {
  const options = buildSupabaseGoogleOAuthOptions("https://pixzer.vercel.app/auth/confirm");
  assert.equal(options.queryParams.prompt, "select_account");
  assert.equal("login_hint" in options.queryParams, false);
  assert.equal(options.redirectTo, "https://pixzer.vercel.app/auth/confirm");
});

test("provider and callback failures map to generic actionable messages", () => {
  assert.equal(mapOAuthProviderError("access_denied", null), "google-access-denied");
  assert.equal(mapOAuthProviderError(null, "redirect_uri_mismatch"), "google-redirect-mismatch");
  assert.equal(mapOAuthProviderError(null, "flow_state_not_found"), "oauth-session-failed");
  assert.equal(mapOAuthProviderError("temporarily_unavailable", null), "google-unavailable");
  assert.equal(mapOAuthFragmentError("#error=access_denied&error_description=private+details"), "google-access-denied");
  assert.equal(mapOAuthFragmentError("#error_code=flow_state_expired"), "oauth-session-failed");
  assert.equal(mapOAuthFragmentError("#access_token=secret"), null);
  assert.equal(parseOAuthError("invite-required"), "invite-required");
  assert.equal(parseOAuthError("client_secret=should-never-display"), undefined);
  assert.match(getOAuthErrorMessage("google-access-denied"), /test user/i);
});
