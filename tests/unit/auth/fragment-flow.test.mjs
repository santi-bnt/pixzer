import assert from "node:assert/strict";
import test from "node:test";
import {
  completeAuthFragment,
  getAuthDestination,
  getPasswordSignInOutcome,
  getSafeAuthNextPath,
  hasAuthFragment,
  parseAuthFragment,
} from "../../../src/features/auth/fragment-flow.mjs";

test("keeps callback redirects local and rejects external destinations", () => {
  const origin = "https://pixzer.vercel.app";
  const fallback = "/library";
  assert.equal(
    getSafeAuthNextPath("/reset-password", origin, fallback),
    "/reset-password",
  );
  assert.equal(
    getSafeAuthNextPath("https://evil.example/", origin, fallback),
    fallback,
  );
  assert.equal(getSafeAuthNextPath("//evil.example/", origin, fallback), fallback);
  assert.equal(getSafeAuthNextPath("/%5c%5cevil.example", origin, fallback), fallback);
});

test("detects token fragments without returning them", () => {
  assert.equal(
    hasAuthFragment("#access_token=test-access&refresh_token=test-refresh&type=recovery"),
    true,
  );
  assert.equal(hasAuthFragment("#section=games"), false);
});

test("parses only supported invite and recovery fragment sessions", () => {
  assert.deepEqual(
    parseAuthFragment(
      "#access_token=test-access&refresh_token=test-refresh&type=recovery",
    ),
    {
      accessToken: "test-access",
      refreshToken: "test-refresh",
      type: "recovery",
    },
  );
  assert.equal(
    parseAuthFragment(
      "#access_token=test-access&refresh_token=test-refresh&type=signup",
    ),
    null,
  );
  assert.equal(
    parseAuthFragment("#access_token=test-access&type=invite"),
    null,
  );
});

test("routes an invited recovery or invitation to its matching form", () => {
  assert.equal(getAuthDestination("recovery", "2026-01-01T00:00:00Z"), "/reset-password");
  assert.equal(getAuthDestination("invite", "2026-01-01T00:00:00Z"), "/register");
  assert.equal(getAuthDestination("recovery", null), null);
  assert.equal(getAuthDestination("invite", undefined), null);
  assert.equal(getAuthDestination("unknown", "2026-01-01T00:00:00Z"), null);
});

test("establishes a verified invited recovery session and selects reset form", async () => {
  const calls = [];
  const result = await completeAuthFragment(
    "#access_token=test-access&refresh_token=test-refresh&type=recovery",
    {
      async setSession(session) {
        calls.push(["setSession", session]);
        return { error: null };
      },
      async getUser() {
        calls.push(["getUser"]);
        return {
          user: { invited_at: "2026-01-01T00:00:00Z" },
          error: null,
        };
      },
      async signOut() {
        calls.push(["signOut"]);
        return { error: null };
      },
    },
  );

  assert.deepEqual(result, {
    status: "authorized",
    destination: "/reset-password",
  });
  assert.deepEqual(calls, [
    [
      "setSession",
      { access_token: "test-access", refresh_token: "test-refresh" },
    ],
    ["getUser"],
  ]);
});

test("signs out a valid but uninvited identity instead of granting a destination", async () => {
  let signedOut = false;
  const result = await completeAuthFragment(
    "#access_token=test-access&refresh_token=test-refresh&type=invite",
    {
      async setSession() {
        return { error: null };
      },
      async getUser() {
        return { user: { invited_at: null }, error: null };
      },
      async signOut() {
        signedOut = true;
        return { error: null };
      },
    },
  );

  assert.deepEqual(result, { status: "unauthorized" });
  assert.equal(signedOut, true);
});

test("does not establish sessions from unsupported fragments", async () => {
  let sessionAttempted = false;
  const result = await completeAuthFragment(
    "#access_token=test-access&refresh_token=test-refresh&type=signup",
    {
      async setSession() {
        sessionAttempted = true;
        return { error: null };
      },
      async getUser() {
        return { user: null, error: null };
      },
      async signOut() {
        return { error: null };
      },
    },
  );

  assert.deepEqual(result, { status: "invalid" });
  assert.equal(sessionAttempted, false);
});

test("distinguishes password errors from an uninvited authenticated account", () => {
  assert.equal(
    getPasswordSignInOutcome({
      credentialsAccepted: false,
      userVerified: false,
      invitedAt: null,
    }),
    "invalid-credentials",
  );
  assert.equal(
    getPasswordSignInOutcome({
      credentialsAccepted: true,
      userVerified: false,
      invitedAt: null,
    }),
    "unavailable",
  );
  assert.equal(
    getPasswordSignInOutcome({
      credentialsAccepted: true,
      userVerified: true,
      invitedAt: null,
    }),
    "invite-required",
  );
  assert.equal(
    getPasswordSignInOutcome({
      credentialsAccepted: true,
      userVerified: true,
      invitedAt: "2026-01-01T00:00:00Z",
    }),
    "authenticated",
  );
});
