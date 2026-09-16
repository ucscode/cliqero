"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ProfileSettings } from "./profile";
import { ApiKeySettings } from "./api-keys";
import { AccountSettings } from "./account";

const tabItems = [
  ["profile", "Profile"],
  ["api-keys", "API keys"],
  ["account", "Account"],
] as const;

export function SettingsPanel() {
  const params = useSearchParams();
  const tab = params.get("tab") ?? "profile";
  const active = tabItems.some(([value]) => value === tab) ? tab : "profile";
  return (
    <section className="grid gap-4" aria-labelledby="settings-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Settings</p>
          <h2 id="settings-heading">Your Cliqero account</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Manage your profile, connected access tools, and API credentials.
          </p>
        </div>
      </div>
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200"
        aria-label="Settings sections"
      >
        {tabItems.map(([value, label]) => (
          <Link
            className={
              active === value
                ? "border-b-2 border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }
            href={`/dashboard?section=settings&tab=${value}`}
            key={value}
          >
            {label}
          </Link>
        ))}
      </nav>
      {active === "profile" && <ProfileSettings />}
      {active === "api-keys" && <ApiKeySettings />}
      {active === "account" && <AccountSettings />}
    </section>
  );
}
