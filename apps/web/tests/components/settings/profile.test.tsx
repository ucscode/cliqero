import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountrySelect } from "@/components/country-select";
import { SettingsPanel } from "@/components/settings/panel";

const profileSource = readFileSync(
  new URL("../../../src/components/settings/profile.tsx", import.meta.url),
  "utf8",
);

describe("customer profile settings", () => {
  it("renders a single profile surface without a one-item tab bar or technical settings", () => {
    const html = renderToStaticMarkup(<SettingsPanel />);

    expect(html).toContain("Your Cliqero account");
    expect(html).not.toContain("Settings sections");
    expect(html).not.toContain("API keys");
    expect(html).not.toContain("Better Auth");
    expect(html).not.toContain("Provider linking");
    expect(html).not.toContain("Headless access");
    expect(profileSource).toMatch(/id="settings-username"[\s\S]*?readOnly/);
    expect(profileSource).toMatch(
      /id="settings-email"[\s\S]*?value=\{profile\.email\}[\s\S]*?readOnly/,
    );
    expect(profileSource.indexOf('id="settings-country"')).toBeLessThan(
      profileSource.indexOf('id="settings-email"'),
    );
    expect(profileSource.indexOf('id="settings-email"')).toBeLessThan(
      profileSource.indexOf('form="settings-profile-form"'),
    );
    expect(profileSource).toContain("JSON.stringify({ country: country || null })");
    expect(profileSource).toContain("authClient.changeEmail({");
    expect(profileSource).toContain("Verification email sent to ${proposedEmail}.");
    expect(profileSource).not.toContain("setProfile({ ...profile, email");
    expect(profileSource).toContain("newEmail: proposedEmail");
  });

  it("uses the shared country-list options and allows the settings selection to be empty", () => {
    const settings = renderToStaticMarkup(
      <CountrySelect
        id="settings-country"
        value="NG"
        onChange={() => undefined}
        required={false}
      />,
    );
    const onboarding = renderToStaticMarkup(
      <CountrySelect id="country" value="" onChange={() => undefined} />,
    );

    expect(settings).toMatch(/<option value="NG" selected="">Nigeria<\/option>/);
    expect(settings).toContain('id="settings-country"');
    expect(settings).not.toMatch(/<select[^>]*id="settings-country"[^>]*required/);
    expect(onboarding).toMatch(/<select[^>]*id="country"[^>]*required/);
  });
});
