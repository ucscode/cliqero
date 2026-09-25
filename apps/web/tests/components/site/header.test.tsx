import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalHeaderAccountLabel } from "@/components/site/header";

const source = readFileSync(resolve(process.cwd(), "src/components/site/header.tsx"), "utf8");

describe("public customer header identity and navigation", () => {
  it("uses the canonical application session username, with a neutral loading label", () => {
    expect(canonicalHeaderAccountLabel(undefined, null)).toBe("Account");
    expect(canonicalHeaderAccountLabel("auth-user-1", null)).toBe("Account");
    expect(
      canonicalHeaderAccountLabel("auth-user-1", {
        userId: "auth-user-1",
        username: "cliqero_name",
      }),
    ).toBe("cliqero_name");
    expect(
      canonicalHeaderAccountLabel("auth-user-2", {
        userId: "auth-user-1",
        username: "stale_name",
      }),
    ).toBe("Account");
    expect(source).toContain("fetchCanonicalApplicationSession");
    expect(source).not.toContain("authDisplayName");
    expect(source).not.toContain("user.name");
  });

  it("links customer account settings consistently and keeps Dashboard in the account menu", () => {
    expect(source).not.toContain("/dashboard?section=profile");
    expect(source).toContain('href="/dashboard?section=settings"');
    expect(source).toContain(">Settings</Link>");
    expect(source).toContain('href="/dashboard">Dashboard</Link>');
    expect(source).toContain('href="/login"');
    expect(source).toContain('href="/register">Join {siteConfig.name}</Link>');
    const primaryNavigation = source
      .split('aria-label="Primary navigation"')[1]
      ?.split("</nav>")[0];
    expect(primaryNavigation).toBeDefined();
    expect(primaryNavigation).not.toContain('href="/dashboard"');
    expect(source).toContain('aria-label="Signed in account"');
  });
});
