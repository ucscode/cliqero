import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical listing schema", () => {
  it("requires a trimmed short description for published listings", () => {
    const schema = readFileSync(
      resolve(process.cwd(), "../../database/migrations/001_initial_schema.sql"),
      "utf8",
    );
    expect(schema).toContain(
      "CONSTRAINT listings_published_short_description_required CHECK (((state <> 'published'::text) OR (length(TRIM(BOTH FROM short_description)) > 0)))",
    );
    expect(schema).toContain(
      "CONSTRAINT listings_short_description_length CHECK ((length(short_description) <= 200))",
    );
  });
});
