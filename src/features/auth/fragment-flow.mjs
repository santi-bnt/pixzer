const callbackDestinations = new Map([
  ["invite", "/register"],
  ["recovery", "/reset-password"],
]);

function getFragmentParams(fragment) {
  const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return new URLSearchParams(value);
}

/** Detect fragment-only Auth results without returning or logging their values. */
export function hasAuthFragment(fragment) {
  const params = getFragmentParams(fragment);
  return [
    "access_token",
    "refresh_token",
    "error",
    "error_code",
    "error_description",
  ].some((name) => params.has(name));
}

/** Resolve only a same-origin relative auth continuation path. */
export function getSafeAuthNextPath(candidate, origin, fallback) {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return fallback;
  }

  try {
    const decoded = decodeURIComponent(candidate);
    const parsed = new URL(candidate, origin);
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      parsed.origin !== origin
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/** Read only supported invitation and recovery sessions from the browser fragment. */
export function parseAuthFragment(fragment) {
  const params = getFragmentParams(fragment);
  const type = params.get("type");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (
    (type !== "invite" && type !== "recovery") ||
    !accessToken ||
    !refreshToken
  ) {
    return null;
  }

  return { accessToken, refreshToken, type };
}

/** Never provide a continuation destination to a user without a trusted invite. */
export function getAuthDestination(type, invitedAt) {
  if (!invitedAt) return null;
  return callbackDestinations.get(type) ?? null;
}

/** Establish a browser-delivered session, then require a verified invite. */
export async function completeAuthFragment(fragment, auth) {
  const payload = parseAuthFragment(fragment);
  if (!payload) return { status: "invalid" };

  try {
    const { error: sessionError } = await auth.setSession({
      access_token: payload.accessToken,
      refresh_token: payload.refreshToken,
    });
    if (sessionError) {
      await auth.signOut();
      return { status: "invalid" };
    }

    const { user, error: userError } = await auth.getUser();
    if (userError || !user) {
      await auth.signOut();
      return { status: "unavailable" };
    }

    const destination = getAuthDestination(payload.type, user.invited_at);
    if (!destination) {
      await auth.signOut();
      return { status: "unauthorized" };
    }

    return { status: "authorized", destination };
  } catch {
    try {
      await auth.signOut();
    } catch {
      // The caller still sends the browser to a protected public route.
    }
    return { status: "unavailable" };
  }
}

/** Keep credential rejection separate from invitation and session verification. */
export function getPasswordSignInOutcome({
  credentialsAccepted,
  userVerified,
  invitedAt,
}) {
  if (!credentialsAccepted) return "invalid-credentials";
  if (!userVerified) return "unavailable";
  if (!invitedAt) return "invite-required";
  return "authenticated";
}
