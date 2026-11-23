import { AppShell } from "@/components/app-shell";
import { Notice, SectionTitle } from "@/components/ui";
import { AppearanceSelect } from "@/features/appearance/theme-provider";

const settings = [
  ["Account", "Sign-in, email and invited access", "Connected"],
  ["Storage", "Private library capacity and usage", "Available in Phase 3"],
  ["Controls", "Keyboard and gamepad preferences", "Available with player"],
  ["Data & privacy", "Export saves or delete your files", "Planned"],
];

export default function SettingsPage() {
  return (
    <AppShell active="Settings">
      <SectionTitle eyebrow="Preferences" title="Settings">
        A clear home for account, storage, and play preferences.
      </SectionTitle>
      <div className="panel divide-y divide-[var(--line)] rounded-2xl px-5">
        <AppearanceSelect />
        {settings.map(([title, subtitle, status]) => (
          <section
            key={title}
            className="flex flex-wrap items-center justify-between gap-3 py-5"
          >
            <div>
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="mt-1 text-xs text-muted">{subtitle}</p>
            </div>
            <span className="rounded-full border border-token px-3 py-1.5 text-[11px] text-muted">
              {status}
            </span>
          </section>
        ))}
      </div>
      <div className="mt-5">
        <Notice
          title="Appearance is ready"
          body="Your theme choice is saved on this device and syncs to your pixzer account when an authenticated Supabase session is available. Other account and control preferences will arrive in later phases."
        />
      </div>
    </AppShell>
  );
}
