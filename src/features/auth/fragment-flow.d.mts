export type SupportedAuthLinkType = "invite" | "recovery";

export type AuthFragment = {
  accessToken: string;
  refreshToken: string;
  type: SupportedAuthLinkType;
};

export function hasAuthFragment(fragment: string): boolean;
export function getSafeAuthNextPath(
  candidate: string | null | undefined,
  origin: string,
  fallback: string,
): string;
export function parseAuthFragment(fragment: string): AuthFragment | null;
export function getAuthDestination(
  type: string,
  invitedAt: string | null | undefined,
): "/register" | "/reset-password" | null;

export type FragmentAuthResult =
  | { status: "invalid" }
  | { status: "unavailable" }
  | { status: "unauthorized" }
  | { status: "authorized"; destination: "/register" | "/reset-password" };

export type FragmentAuthClient = {
  setSession: (session: {
    access_token: string;
    refresh_token: string;
  }) => Promise<{ error: unknown | null }>;
  getUser: () => Promise<{
    user: { invited_at?: string | null } | null;
    error: unknown | null;
  }>;
  signOut: () => Promise<unknown>;
};

export function completeAuthFragment(
  fragment: string,
  auth: FragmentAuthClient,
): Promise<FragmentAuthResult>;

export type PasswordSignInOutcome =
  | "invalid-credentials"
  | "unavailable"
  | "invite-required"
  | "authenticated";

export function getPasswordSignInOutcome(input: {
  credentialsAccepted: boolean;
  userVerified: boolean;
  invitedAt: string | null | undefined;
}): PasswordSignInOutcome;
