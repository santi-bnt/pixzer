import { AppShell } from "@/components/app-shell";
import { Notice, SectionTitle } from "@/components/ui";

const settings = [
  ["Account", "Sign-in, email and invited access", "Not connected"],
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
      <div className="panel divide-y divide-white/[.07] rounded-2xl px-5">
        {settings.map(([title, subtitle, status]) => (
          <section
            key={title}
            className="flex flex-wrap items-center justify-between gap-3 py-5"
          >
            <div>
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="mt-1 text-xs text-[#a5a8b8]">{subtitle}</p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-[#9497a6]">
              {status}
            </span>
          </section>
        ))}
      </div>
      <div className="mt-5">
        <Notice
          title="Settings are not saved"
          body="No account or device preferences are currently collected. Configuration becomes interactive in later phases."
        />
      </div>
    </AppShell>
  );
}
