import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CountrySelect } from "@/components/country-select";
import { SettingsPanel } from "@/components/settings/panel";
import { saveProfileSettings } from "@/components/settings/profile";
import type { Profile } from "@/lib/api-client";

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
    expect(profileSource).toMatch(/id="settings-username"[\s\S]*?disabled/);
    expect(profileSource).not.toMatch(/id="settings-username"[^\n]*readOnly/);
    expect(profileSource).toContain('id="settings-email"');
    expect(profileSource).toContain('type="email"');
    expect(profileSource).toContain("value={emailInput}");
    expect(profileSource).toContain("onChange={(event) => setEmailInput(event.target.value)}");
    expect(profileSource).toContain("setEmailInput(value.email)");
    expect(profileSource).toContain('<form id="settings-profile-form"');
    expect(profileSource.match(/<form\b/g)).toHaveLength(1);
    expect(profileSource).toMatch(
      /<form id="settings-profile-form"[\s\S]*?settings-email[\s\S]*?Save profile/,
    );
    expect(profileSource).not.toContain("readOnly");
    expect(profileSource).not.toContain("Change email");
    expect(profileSource).not.toContain("Send verification");
    expect(profileSource).not.toContain("emailChangeOpen");
    expect(profileSource).not.toContain("const [newEmail");
    expect(profileSource).not.toContain("settings-new-email");
    expect(profileSource).toContain("JSON.stringify({ country: nextCountry })");
    expect(profileSource).toContain("authClient.changeEmail({");
    expect(profileSource).toContain(
      "Profile saved. If the email address can be used, check it for a verification link.",
    );
    expect(profileSource).not.toContain("setProfile({ ...profile, email");
  });

  it("saves country without requesting an unchanged email and compares normalized addresses", async () => {
    const profile: Profile = {
      id: "member-id",
      email: "member@example.test",
      username: "member",
      country: "NG",
    };
    const saveProfile = vi.fn(async (country: string | null) => ({ ...profile, country }));
    const requestEmailChange = vi.fn(async () => undefined);

    const result = await saveProfileSettings({
      profile,
      country: "GH",
      emailInput: "  MEMBER@example.test  ",
      saveProfile,
      requestEmailChange,
    });

    expect(saveProfile).toHaveBeenCalledOnce();
    expect(saveProfile).toHaveBeenLastCalledWith("GH");
    expect(requestEmailChange).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      profile: { email: "member@example.test", country: "GH" },
      emailInput: "member@example.test",
      message: "Profile saved.",
      error: null,
    });
  });

  it("trims a changed email, requests verification, and keeps the canonical address in the form", async () => {
    const profile: Profile = {
      id: "member-id",
      email: "member@example.test",
      username: "member",
      country: "NG",
    };
    const calls: string[] = [];
    const saveProfile = vi.fn(async (country: string | null) => {
      calls.push("profile");
      return { ...profile, country };
    });
    const requestEmailChange = vi.fn(async (email: string) => {
      calls.push(`email:${email}`);
    });

    const result = await saveProfileSettings({
      profile,
      country: "GH",
      emailInput: "  new@example.com  ",
      saveProfile,
      requestEmailChange,
    });

    expect(calls).toEqual(["profile", "email:new@example.com"]);
    expect(requestEmailChange).toHaveBeenCalledOnce();
    expect(requestEmailChange).toHaveBeenLastCalledWith("new@example.com");
    expect(result.profile.email).toBe("member@example.test");
    expect(result.emailInput).toBe("member@example.test");
    expect(result.message).toBe(
      "Profile saved. If the email address can be used, check it for a verification link.",
    );
    expect(result.message).not.toContain("sent");
    expect(result.error).toBeNull();
  });

  it("keeps the canonical email after an email-change request fails while reporting the partial save", async () => {
    const profile: Profile = {
      id: "member-id",
      email: "member@example.test",
      username: "member",
      country: "NG",
    };
    const result = await saveProfileSettings({
      profile,
      country: "GH",
      emailInput: "new@example.com",
      saveProfile: async (country) => ({ ...profile, country }),
      requestEmailChange: async () => {
        throw new Error("private provider details");
      },
    });

    expect(result.profile.email).toBe("member@example.test");
    expect(result.emailInput).toBe("new@example.com");
    expect(result.message).toBe("Profile saved.");
    expect(result.error).toContain("profile was saved");
    expect(result.error).not.toContain("private provider details");
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
