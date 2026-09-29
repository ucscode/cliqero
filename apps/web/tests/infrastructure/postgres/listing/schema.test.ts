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

  it("defines normalized categories, visibility, and compare-at pricing constraints", () => {
    const schema = readFileSync(
      resolve(process.cwd(), "../../database/migrations/001_initial_schema.sql"),
      "utf8",
    );
    expect(schema).toContain("CREATE TABLE listing_capability.categories");
    expect(schema).toContain("CREATE TABLE listing_capability.listing_categories");
    expect(schema).toContain("listing_categories_name_ci_unique");
    expect(schema).toContain("listing_categories_category_fk FOREIGN KEY (category_id)");
    expect(schema).toContain("ON DELETE RESTRICT");
    expect(schema).toContain("ON DELETE CASCADE");
    expect(schema).toContain("listings_compare_at_price_valid");
    expect(schema).toContain("compare_at_price_minor > price_minor");
    expect(schema).toContain("listings_visibility_valid");
    expect(schema).toContain("'public'::text, 'authenticated'::text");
  });
});
