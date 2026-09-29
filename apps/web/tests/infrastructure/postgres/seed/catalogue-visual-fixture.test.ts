import { describe, expect, it } from "vitest";
import { AUTHENTICATED_REVIEWED_CATALOGUE_FIXTURE as fixture } from "@/infrastructure/postgres/seed/catalogue-visual-fixture";

describe("signed-in catalogue visual fixture", () => {
  it("is a published-seed target with multiple categories, an approved rating, and compare-at price", () => {
    expect(fixture).toMatchObject({
      externalKey: "toolkit-08",
      state: "published",
      visibility: "authenticated",
      categorySlugs: ["operations", "product"],
      compareAtPriceMinor: "1500",
      createdAt: "2026-01-01T00:00:00.000Z",
      approvedRating: 5,
    });
  });
});
