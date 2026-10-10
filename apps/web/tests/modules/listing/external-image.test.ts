import { describe, expect, it } from "vitest";
import { externalListingImageUrl } from "@/modules/listing/external-image";

describe("external listing image metadata", () => {
  it("accepts only bounded HTTP(S) image URLs", () => {
    expect(
      externalListingImageUrl({ external_image_url: "https://images.example.test/a.webp" }),
    ).toBe("https://images.example.test/a.webp");
    expect(
      externalListingImageUrl({ external_image_url: "http://images.example.test/a.png" }),
    ).toBe("http://images.example.test/a.png");
    expect(externalListingImageUrl({ external_image_url: "javascript:alert(1)" })).toBeNull();
    expect(externalListingImageUrl({ external_image_url: "not a URL" })).toBeNull();
    expect(externalListingImageUrl({ external_image_url: "x".repeat(2001) })).toBeNull();
    expect(externalListingImageUrl({})).toBeNull();
  });
});
