/** Minimal environment parsing. Server secrets are deliberately not exported to client modules. */
export type ServerEnvironment = {
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2Endpoint: string;
};

export function readServerEnvironment(): ServerEnvironment {
  const required = {
    r2AccountId: process.env.R2_ACCOUNT_ID,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    r2BucketName: process.env.R2_BUCKET_NAME,
    r2Endpoint: process.env.R2_ENDPOINT,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing server environment values: ${missing.join(", ")}`);
  }

  return {
    r2AccountId: required.r2AccountId!,
    r2AccessKeyId: required.r2AccessKeyId!,
    r2SecretAccessKey: required.r2SecretAccessKey!,
    r2BucketName: required.r2BucketName!,
    r2Endpoint: required.r2Endpoint!,
  };
}

export function readPublicSupabaseEnvironment(): {
  url: string;
  anonKey: string;
} | null {
  const {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  } = process.env;
  return url && anonKey ? { url, anonKey } : null;
}
