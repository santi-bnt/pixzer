"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export type AppearancePreference = "light" | "dark" | "system";

type AppearanceContextValue = {
  preference: AppearancePreference;
  setPreference: (preference: AppearancePreference) => void;
};

const STORAGE_KEY = "pocketarcade.appearance";
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function readPreference(value: string | null): AppearancePreference {
  return value === "light" || value === "dark" ? value : "system";
}

function readStoredPreference(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function resolveTheme(preference: AppearancePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyPreference(preference: AppearancePreference) {
  const root = document.documentElement;
  root.dataset.appearance = preference;
  root.dataset.theme = resolveTheme(preference);
  root.style.colorScheme = root.dataset.theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<AppearancePreference>("system");
  const userChangedPreference = useRef(false);
  const queuedRemoteWrite = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    let authSubscription: { unsubscribe: () => void } | undefined;
    const initial = readPreference(
      document.documentElement.dataset.appearance ?? readStoredPreference(),
    );
    window.setTimeout(() => {
      if (active) setPreferenceState(initial);
    }, 0);
    applyPreference(initial);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      if (
        readPreference(
          document.documentElement.dataset.appearance ?? readStoredPreference(),
        ) === "system"
      ) {
        applyPreference("system");
      }
    };

    media.addEventListener("change", updateSystemTheme);

    // Apply local preference first; account synchronization is best effort.
    void (async () => {
      try {
        const supabase = createSupabaseClient();
        const syncAccountAppearance = async () => {
          const { data, error } = await supabase.auth.getUser();
          if (!active || error || !data.user) return;

          const remote = data.user.user_metadata?.appearance;
          const stored = readPreference(
            document.documentElement.dataset.appearance ??
              readStoredPreference(),
          );
          if (
            !userChangedPreference.current &&
            (remote === "light" || remote === "dark" || remote === "system")
          ) {
            setPreferenceState(remote);
            applyPreference(remote);
            try {
              localStorage.setItem(STORAGE_KEY, remote);
            } catch {
              // The remote preference still applies for this tab.
            }
            return;
          }

          await supabase.auth.updateUser({ data: { appearance: stored } });
        };

        authSubscription = supabase.auth.onAuthStateChange((event, session) => {
          if (event === "SIGNED_OUT") {
            userChangedPreference.current = false;
          }
          if (event === "SIGNED_IN" && session) {
            // Defer Auth calls until after the auth event callback releases its lock.
            window.setTimeout(() => void syncAccountAppearance(), 0);
          }
        }).data.subscription;
        await syncAccountAppearance();
      } catch {
        // Theme selection remains available without an auth configuration.
      }
    })();

    return () => {
      active = false;
      authSubscription?.unsubscribe();
      media.removeEventListener("change", updateSystemTheme);
    };
  }, []);

  const setPreference = useCallback((next: AppearancePreference) => {
    userChangedPreference.current = true;
    setPreferenceState(next);
    applyPreference(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The in-memory theme still changes when browser storage is unavailable.
    }
    queuedRemoteWrite.current = queuedRemoteWrite.current
      .then(async () => {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase.auth.getUser();
        if (!error && data.user) {
          await supabase.auth.updateUser({ data: { appearance: next } });
        }
      })
      .catch(() => {
        // Remote sync is optional; local preference remains authoritative here.
      });
  }, []);

  const value = useMemo(
    () => ({ preference, setPreference }),
    [preference, setPreference],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used within ThemeProvider");
  }
  return context;
}

export function AppearanceSelect({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useAppearance();

  return (
    <label
      className={
        compact
          ? "inline-flex items-center gap-2 text-xs text-muted"
          : "flex flex-wrap items-center justify-between gap-3 py-5"
      }
    >
      <span className={compact ? "sr-only" : ""}>
        <span className="block text-sm font-semibold">Appearance</span>
        <span className="mt-1 block text-xs text-muted">
          Choose light, dark, or follow your device.
        </span>
      </span>
      <select
        aria-label="Appearance"
        className={`theme-select ${compact ? "theme-select--compact" : ""}`}
        onChange={(event) => setPreference(readPreference(event.target.value))}
        value={preference}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
