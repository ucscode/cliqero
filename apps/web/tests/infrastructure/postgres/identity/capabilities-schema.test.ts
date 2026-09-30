import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical account-capability schema", () => {
  it("accepts the API-key self-management eligibility capability", () => {
    const schema = readFileSync(
      resolve(process.cwd(), "../../database/migrations/001_initial_schema.sql"),
      "utf8",
    );
    expect(schema).toContain("'api_keys.self_manage'::text");
  });
});
