/** Phase 1 boundary only. A concrete Supabase client is added with Auth in Phase 2. */
export type AuthUser = { id: string; email: string | null };

export interface AuthProvider {
  getCurrentUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}
