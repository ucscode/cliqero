import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/onboarding-form.tsx"), "utf8");

describe("OAuth onboarding authentication boundary", () => {
  it("keeps incomplete sessions on onboarding and invalid sessions out", () => {
    expect(source).toContain("/api/me/onboarding");
    expect(source).toContain("authClient");
    expect(source).toContain("signOut");
    expect(source).toContain('router.replace("/login")');
    expect(source).toContain("router.replace(next)");
  });
});
