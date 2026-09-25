import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
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

const page: ListingPage = { items: [], next_cursor: null };

describe("storefront listing-page request state", () => {
  it("enters loading and hides stale results when the URL query changes", () => {
    const previous = listingPageRequestSucceeded("old-query", page);
    const current = listingPageRequestForKey(previous, "new-query");

    expect(current).toEqual(listingPageRequestStarted("new-query"));
    expect(current.page).toBeNull();
    expect(current.error).toBeNull();
    expect(catalogueSource).toContain("query, sort, cursor");
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
    expect(catalogueSource).toContain("let active = true");
    expect(catalogueSource).toContain("if (active) setRequest(listingPageRequestSucceeded");
    expect(catalogueSource).toContain("if (active)");
    expect(catalogueSource).toContain('params.set("search", query)');
    expect(catalogueSource).toContain('params.set("cursor", cursor)');
    expect(catalogueSource).toContain('params.set("sort", sort)');
    expect(catalogueSource).toContain("trail");
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
