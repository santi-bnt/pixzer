export function createDriveOAuthParameters(): { state: string; verifier: string; challenge: string };
export function buildDriveAuthorizationUrl(input: {clientId:string;redirectUri:string;state:string;challenge:string;forceConsent?:boolean}): string;
export function equalOAuthState(expected: string|null, actual: string|null): boolean;
