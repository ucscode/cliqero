import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const shell = readFileSync(resolve(process.cwd(), "src/components/dashboard/shell.tsx"), "utf8");

describe("dashboard authentication boundary", () => {
  it("checks the canonical account before constructing the dashboard", () => {
    expect(shell).toContain("fetchCanonicalApplicationSession");
    expect(shell).toContain("authClient.signOut()");
    expect(shell).toContain('router.replace("/login")');
    expect(shell).toContain("router.refresh()");
    expect(shell).toContain("canonicalSession === undefined");
    expect(shell).toContain("canonicalSession.account.username");
    expect(shell).not.toContain("authDisplayName");
  });

  it("does not let profile failure create an Account identity fallback", () => {
    expect(shell).toContain("profile?.username ?? canonicalSession.account.username");
    expect(shell).not.toContain("profile?.username ?? providerDisplayName");
  });
});
