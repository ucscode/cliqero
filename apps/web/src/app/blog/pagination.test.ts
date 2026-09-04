import { describe, expect, it } from "vitest";
import { archiveHref, archiveNavigation, decodeCursorTrail } from "./pagination";

describe("blog archive cursor navigation", () => {
  it("renders only an older link on the first page", () => {
    expect(archiveNavigation({ nextCursor: "c1" })).toEqual({
      newerHref: null,
      olderHref: "/blog?cursor=c1&trail=%5B%22%22%5D",
    });
  });

  it("keeps a cursor trail for middle pages and navigates newer", () => {
    const first = archiveNavigation({ cursor: "c1", trail: '[""]', nextCursor: "c2" });
    expect(first.newerHref).toBe("/blog");
    expect(first.olderHref).toBe("/blog?cursor=c2&trail=%5B%22%22%2C%22c1%22%5D");
  });

  it("renders only a newer link on the final page", () => {
    expect(archiveNavigation({ cursor: "c2", trail: '["","c1"]' })).toEqual({
      newerHref: "/blog?cursor=c1&trail=%5B%22%22%5D",
      olderHref: null,
    });
  });

  it("preserves category and tag filters while moving in both directions", () => {
    expect(
      archiveNavigation({ category: "guides", cursor: "c1", trail: '[""]', nextCursor: "c2" }),
    ).toEqual({
      newerHref: "/blog/category/guides",
      olderHref: "/blog/category/guides?cursor=c2&trail=%5B%22%22%2C%22c1%22%5D",
    });
    expect(archiveHref({ tag: "launch", cursor: "c1", trail: [""] })).toBe(
      "/blog/tag/launch?cursor=c1&trail=%5B%22%22%5D",
    );
  });

  it("treats malformed trail state as the first page", () => {
    expect(decodeCursorTrail("not-json")).toEqual([]);
    expect(archiveNavigation({ trail: "not-json", nextCursor: "c1" }).newerHref).toBeNull();
  });
});
