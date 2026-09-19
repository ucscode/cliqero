import { describe, expect, it } from "vitest";
import { PostgresListingRepository } from "@/infrastructure/postgres/listing/repository";
import { Listing } from "@/modules/listing";
import { Money } from "@/modules/money/money";

describe("PostgresListingRepository descriptions", () => {
  it("persists both descriptions and searches both fields", async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const repository = new PostgresListingRepository({
      query: async <T extends object>(sql: string, values: readonly unknown[] = []) => {
        calls.push({ sql, values });
        return { rows: [] as T[], rowCount: 0 };
      },
    });
    const listing = Listing.create({
      id: "listing-1",
      sellerId: "seller-1",
      title: "Listing",
      shortDescription: "Quick summary",
      longDescription: "Detailed Markdown content",
      price: Money.of(100n, "USD"),
      destination: "https://example.com",
    });

    await repository.save(listing);
    await repository.query({ search: "Markdown", limit: 20 });

    expect(calls[0]?.sql).toContain("short_description, long_description");
    expect(calls[0]?.values).toContain("Quick summary");
    expect(calls[0]?.values).toContain("Detailed Markdown content");
    expect(calls[1]?.sql).toContain("title||' '||short_description||' '||long_description");
  });
});
