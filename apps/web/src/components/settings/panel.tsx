import { ProfileSettings } from "./profile";

export function SettingsPanel() {
  return (
    <section className="grid gap-4" aria-labelledby="settings-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="settings-heading" className="text-2xl font-semibold tracking-tight">
            Your account
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Keep your account details up to date.
          </p>
        </div>
      </div>
      <ProfileSettings />
    </section>
  );
}
