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
    const searchQuery = calls.find((call) => call.sql.includes("to_tsvector"));

    expect(calls[0]?.sql).toContain("short_description, long_description");
    expect(calls[0]?.values).toContain("Quick summary");
    expect(calls[0]?.values).toContain("Detailed Markdown content");
    expect(searchQuery?.sql).toContain("title||' '||short_description||' '||long_description");
  });

  it("scopes external-key lookups to the supplied seller", async () => {
    let query: { sql: string; values: readonly unknown[] } | undefined;
    const repository = new PostgresListingRepository({
      query: async <T extends object>(sql: string, values: readonly unknown[] = []) => {
        query = { sql, values };
        return { rows: [] as T[], rowCount: 0 };
      },
    });

    await repository.findByExternalKey("seller-uuid", "shared-key");

    expect(query?.sql).toContain(
      "where l.deleted_at is null and l.seller_id=(select id from identity_capability.accounts where uuid=$1) and l.external_key=$2",
    );
    expect(query?.values).toEqual(["seller-uuid", "shared-key"]);
    expect(repository).not.toHaveProperty("findAnyByExternalKey");
  });

  it("filters anonymous listings in SQL and does not exclude authenticated listings for signed-in viewers", async () => {
    const statements: string[] = [];
    const repository = new PostgresListingRepository({
      query: async <T extends object>(sql: string) => {
        statements.push(sql);
        return { rows: [] as T[], rowCount: 0 };
      },
    });
    await repository.query({ publicOnly: true, visibility: "public", limit: 12 });
    await repository.query({ publicOnly: true, visibility: "all", limit: 12 });
    expect(statements[0]).toContain("l.visibility='public'");
    expect(statements[1]).not.toContain("l.visibility='public'");
    expect(statements[1]).not.toContain("l.visibility='authenticated'");
  });

  it.each(["asc", "desc"] as const)(
    "sorts rating from approved aggregate facts with unrated rows last (%s)",
    async (direction) => {
      let statement = "";
      const repository = new PostgresListingRepository({
        query: async <T extends object>(sql: string) => {
          statement = sql;
          return { rows: [] as T[], rowCount: 0 };
        },
      });
      await repository.query({
        sort: "rating",
        direction,
        publicOnly: true,
        visibility: "public",
        limit: 12,
      });

      expect(statement).toContain("where r.status='approved'");
      expect(statement).toContain("round(avg(r.rating)::numeric,2)");
      expect(statement).toContain("l.has_rating desc");
      expect(statement).toContain(`l.rating_average ${direction} nulls last`);
      expect(statement).toContain("l.rating_count desc,l.id asc");
      expect(statement).not.toContain("average_rating::text as rating_average");
      expect(statement).toContain("l.visibility='public'");
    },
  );

  it("does not aggregate every review when the selected sort does not use ratings", async () => {
    let statement = "";
    const repository = new PostgresListingRepository({
      query: async <T extends object>(sql: string) => {
        statement = sql;
        return { rows: [] as T[], rowCount: 0 };
      },
    });
    await repository.query({ sort: "date", direction: "desc", limit: 12 });
    expect(statement).not.toContain("approved_review_summary");
  });

  it("uses query-bound opaque rating cursors and rejects a different sort direction", async () => {
    const rows = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ].map((id) => ({
      id,
      seller_id: "00000000-0000-4000-8000-000000000010",
      seller_pk: 1,
      title: "Listing",
      short_description: "Summary",
      long_description: "Details",
      price_minor: "100",
      price_currency: "USD",
      compare_at_price_minor: null,
      visibility: "public" as const,
      destination_url: "https://example.test/listing",
      metadata: {},
      state: "published" as const,
      external_key: null,
      featured_position: null,
      categories: "[]",
    }));
    const repository = new PostgresListingRepository({
      query: async <T extends object>() => ({ rows: rows as T[], rowCount: rows.length }),
    });
    const firstPage = await repository.query({ sort: "rating", direction: "desc", limit: 1 });
    expect(firstPage.nextCursor).toBeTruthy();

    let nextSql = "";
    const pagedRepository = new PostgresListingRepository({
      query: async <T extends object>(sql: string) => {
        nextSql = sql;
        return { rows: [] as T[], rowCount: 0 };
      },
    });
    await pagedRepository.query({
      sort: "rating",
      direction: "desc",
      cursor: firstPage.nextCursor!,
      limit: 1,
    });
    expect(nextSql).toContain("cursor_listing.has_rating");
    expect(nextSql).toContain("cursor_listing.rating_average");
    expect(nextSql).toContain("cursor_listing.rating_count");
    await expect(
      pagedRepository.query({
        sort: "rating",
        direction: "asc",
        cursor: firstPage.nextCursor!,
        limit: 1,
      }),
    ).rejects.toThrow("Listing cursor does not match this catalogue query");
  });

  it("replaces category memberships as part of the listing repository transaction", async () => {
    const calls: string[] = [];
    const executor = {
      query: async <T extends object>(sql: string) => {
        calls.push(sql);
        return {
          rows: [] as T[],
          rowCount: sql.startsWith("insert into listing_capability.listing_categories") ? 2 : 1,
        };
      },
    };
    const uow = { transaction: async <T>(operation: () => Promise<T>) => operation() };
    const repository = new PostgresListingRepository(executor, uow);
    const listing = Listing.create({
      id: "listing-2",
      sellerId: "seller-1",
      title: "Categorized",
      shortDescription: "Summary",
      longDescription: "Details",
      price: Money.of(2000n, "USD"),
      compareAtPrice: Money.of(4000n, "USD"),
      visibility: "authenticated",
      destination: "https://example.com",
      categories: [
        { id: "00000000-0000-4000-8000-000000000001", name: "API", slug: "api" },
        { id: "00000000-0000-4000-8000-000000000002", name: "Toolkit", slug: "toolkit" },
      ],
    });
    await repository.save(listing);
    expect(calls[0]).toContain("compare_at_price_minor, visibility");
    expect(calls[1]).toContain("delete from listing_capability.listing_categories");
    expect(calls[2]).toContain("insert into listing_capability.listing_categories");
  });
});
