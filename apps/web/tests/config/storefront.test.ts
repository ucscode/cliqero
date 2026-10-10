import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadStorefrontConfiguration } from "@/config/storefront";
import { configurationEnvelope } from "./yaml-fixture";

describe("storefront configuration", () => {
  it("loads validated YAML storefront limits", () => {
    expect(loadStorefrontConfiguration("config/storefront.example.yaml")).toEqual({
      home: { featured_limit: 6 },
      catalogue: { page_size: 12 },
      reviews: { visible: true, page_size: 10 },
    });
  });

  it("rejects the former upload-provider setting instead of treating it as storefront policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "cliqero-storefront-config-"));
    try {
      const path = join(root, "storefront.yaml");
      await writeFile(
        path,
        configurationEnvelope(`
media_provider: filesystem
home:
  featured_limit: 6
catalogue:
  page_size: 12
reviews:
  visible: true
  page_size: 10
`),
      );
      expect(() => loadStorefrontConfiguration(path)).toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
