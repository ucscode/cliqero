import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical entitlement schema", () => {
  it("allows consumed without adding package-specific entitlement columns", () => {
    const schema = readFileSync(
      resolve(process.cwd(), "../../database/migrations/001_initial_schema.sql"),
      "utf8",
    );
    const definition = schema.match(
      /CREATE TABLE entitlement_capability\.entitlements \(([\s\S]*?)\n\);/,
    )?.[1];
    expect(definition).toBeDefined();
    expect(definition).toMatch(
      /'active'::text, 'consumed'::text, 'revoked'::text, 'expired'::text/,
    );
    expect(definition).not.toMatch(
      /capability|benefit|package_type|entitlement_type|destination_type/i,
    );
  });
});
