import { describe, expect, it } from "vitest";
import { loadStorefrontConfiguration } from "./storefront";

describe("storefront configuration", () => {
  it("loads validated YAML storefront limits", () => {
    expect(loadStorefrontConfiguration("config/storefront.example.yaml")).toEqual({
      home: { featured_limit: 6 },
      catalogue: { page_size: 12 },
      reviews: { visible: true, page_size: 10 },
    });
  });
});
