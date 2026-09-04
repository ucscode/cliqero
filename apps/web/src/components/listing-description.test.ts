import { describe, expect, it } from "vitest";
import { listingDescription } from "./listing-description";

describe("listing description presentation", () => {
  it("keeps meaningful descriptions unchanged", () => {
    expect(listingDescription("A practical toolkit.")).toBe("A practical toolkit.");
  });

  it("gives empty descriptions the same intentional fallback in cards and detail", () => {
    expect(listingDescription("   ")).toBe("A considered way to move forward.");
  });
});
