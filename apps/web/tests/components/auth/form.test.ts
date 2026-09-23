import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/auth/form.tsx"), "utf8");

describe("email authentication boundary", () => {
  it("verifies the canonical account before navigating into the app", () => {
    const check = source.indexOf("fetchCanonicalApplicationSession");
    const signOut = source.indexOf("authClient.signOut()", check);
    const navigation = source.indexOf("router.push(next)");
    expect(check).toBeGreaterThan(-1);
    expect(signOut).toBeGreaterThan(check);
    expect(navigation).toBeGreaterThan(signOut);
    expect(source).toContain("Your session could not be connected to a Cliqero account");
  });
});
