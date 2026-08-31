import { describe, expect, it } from "vitest";
import { buyContinuation, canShowPromote, postAuthBuyPath } from "./interaction-model";

describe("storefront interaction model", () => {
  it("renders Promote only for an authenticated visitor", () => {
    expect(canShowPromote(false)).toBe(false);
    expect(canShowPromote(true)).toBe(true);
  });

  it("keeps buy continuation internal and listing-specific", () => {
    expect(buyContinuation("listing-1")).toBe("/listings/listing-1?buy=1");
    expect(postAuthBuyPath("listing-1")).toBe("/dashboard?buy=listing-1");
  });
});
