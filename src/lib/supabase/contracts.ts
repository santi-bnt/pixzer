/** Legacy Phase 1 boundary; Phase 2 uses the concrete Supabase clients. */
export type AuthUser = { id: string; email: string | null };

export interface AuthProvider {
  getCurrentUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}
