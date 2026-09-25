import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/promote-panel.tsx"), "utf8");

describe("Promote panel account invitation", () => {
  it("loads the direct account URL through the authenticated API", () => {
    expect(source).toContain('"/api/referrals/account-url"');
    expect(source).toContain("Invite people to Cliqero");
    expect(source).toContain('shareText="Join me on Cliqero"');
    expect(source).toContain('href="/catalogue"');
  });

  it("does not expose attribution cookie or token values", () => {
    expect(source).not.toContain("cliqero_referrer");
    expect(source).not.toContain("accountReferralSource");
  });

  it("describes invitations and eligible listing links in customer language", () => {
    expect(source).toContain("People who join Cliqero through your invitation");
    expect(source).toContain("share their referral links");
    expect(source).not.toContain("referral attribution is active");
    expect(source).not.toContain("listing-specific referral URL");
  });
});
