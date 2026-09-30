import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  catalogueListRequestUrl,
  catalogueNavigationUrlState,
  catalogueSortUrlState,
  listingPageRequestFailed,
  listingPageRequestForKey,
  listingPageRequestStarted,
  listingPageRequestSucceeded,
} from "@/components/storefront/request-state";
import type { ListingPage } from "@/lib/api-client";

const catalogueSource = readFileSync(
  resolve(process.cwd(), "src/components/storefront/catalogue.tsx"),
  "utf8",
);
const featuredSource = readFileSync(
  resolve(process.cwd(), "src/components/storefront/featured.tsx"),
  "utf8",
);
const requestStateSource = readFileSync(
  resolve(process.cwd(), "src/components/storefront/request-state.ts"),
  "utf8",
);

const page: ListingPage = { items: [], next_cursor: null };

describe("storefront listing-page request state", () => {
  it("enters loading and hides stale results when the URL query changes", () => {
    const previous = listingPageRequestSucceeded("old-query", page);
    const current = listingPageRequestForKey(previous, "new-query");

    expect(current).toEqual(listingPageRequestStarted("new-query"));
    expect(current.page).toBeNull();
    expect(current.error).toBeNull();
    expect(catalogueSource).toContain("JSON.stringify([query, sort, direction, cursor])");
    expect(catalogueSource).toContain("listingPageRequestForKey(request, requestKey)");
  });

  it("clears a previous request error when retry succeeds", () => {
    const failed = listingPageRequestFailed("query", "Temporary failure");
    const retrying = listingPageRequestStarted("query");
    const succeeded = listingPageRequestSucceeded("query", page);

    expect(failed.error).toBe("Temporary failure");
    expect(retrying.status).toBe("loading");
    expect(retrying.error).toBeNull();
    expect(succeeded.status).toBe("success");
    expect(succeeded.error).toBeNull();
    expect(succeeded.page).toBe(page);
  });

  it("lets only the latest catalogue request update state and preserves cursor URL state", () => {
    expect(catalogueSource).toContain('<Button type="submit" variant="action">');
    expect(catalogueSource).toContain("let active = true");
    expect(catalogueSource).toContain("if (active) setRequest(listingPageRequestSucceeded");
    expect(catalogueSource).toContain("if (active)");
    expect(catalogueSource).toContain("catalogueListRequestUrl(query, sort, direction, cursor)");
    expect(requestStateSource).toContain('params.set("search", query)');
    expect(requestStateSource).toContain('params.set("cursor", cursor)');
    expect(requestStateSource).toContain('params.set("sort", sort)');
    expect(requestStateSource).toContain('params.set("direction", direction)');
    expect(catalogueSource).toContain("trail");
    expect(catalogueSource).toContain("setDraftSort(event.target.value as CatalogueSortField)");
    expect(catalogueSource).toContain("onClick={applySorting}");
    expect(catalogueSource).toContain(
      "setDraftDirection(event.target.value as CatalogueSortDirection)",
    );
    expect(catalogueSource).toContain("useEffect(() => {");
    expect(catalogueSource).toContain('aria-label="Apply sorting"');
    expect(catalogueSource).toContain("router.push(`${pathname}?${params}`)");
  });

  it("uses separate sort and direction query values and omits default date-desc values", () => {
    expect(catalogueListRequestUrl("", "date", "desc", "")).toBe("/api/listings?");
    expect(catalogueListRequestUrl("kit", "rating", "asc", "cursor-token")).toBe(
      "/api/listings?search=kit&sort=rating&direction=asc&cursor=cursor-token",
    );
    expect(catalogueListRequestUrl("", "price", "desc", "")).toBe("/api/listings?sort=price");
  });

  it("applies sorting only to URL state, clears pagination, and preserves search", () => {
    expect(
      catalogueSortUrlState(
        "q=workspace&sort=price&direction=asc&cursor=c&trail=a%2Cb",
        "rating",
        "desc",
      ).toString(),
    ).toBe("q=workspace&sort=rating");
    expect(catalogueSortUrlState("q=x&sort=rating&direction=asc", "date", "desc").toString()).toBe(
      "q=x",
    );
  });

  it("retains the applied search and sort across next/previous page URL updates", () => {
    const next = catalogueNavigationUrlState(
      "q=workspace&sort=rating&direction=asc&cursor=old&trail=older",
      { cursor: "next", trail: "old" },
    );
    expect(next.toString()).toBe("q=workspace&sort=rating&direction=asc&cursor=next&trail=old");
    const previous = catalogueNavigationUrlState(next.toString(), {
      cursor: null,
      trail: null,
    });
    expect(previous.toString()).toBe("q=workspace&sort=rating&direction=asc");
  });

  it("keeps featured listing failure local and offers a retry that can be followed by success", () => {
    const failed = listingPageRequestFailed("featured", "Unavailable");
    const retrying = listingPageRequestStarted("featured");
    const succeeded = listingPageRequestSucceeded("featured", page);

    expect(failed.status).toBe("error");
    expect(retrying.status).toBe("loading");
    expect(succeeded.status).toBe("success");
    expect(featuredSource).toContain("Try again");
    expect(featuredSource).toContain("setRequestVersion((version) => version + 1)");
    expect(featuredSource).toContain("if (active) setRequest(listingPageRequestSucceeded");
    expect(featuredSource).toContain("if (active)");
  });
});
