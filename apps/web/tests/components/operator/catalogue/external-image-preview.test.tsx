import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  externalImagePreviewStatus,
  ExternalImagePreview,
} from "@/components/operator/catalogue/external-image-preview";

describe("external catalogue image preview", () => {
  it("renders a local browser preview for valid HTTP URLs and updates with the URL", () => {
    const first = renderToStaticMarkup(
      createElement(ExternalImagePreview, { value: "https://images.example.test/one.webp" }),
    );
    expect(first).toContain('src="https://images.example.test/one.webp"');
    expect(first).toContain("Loading preview…");
    expect(externalImagePreviewStatus("https://images.example.test/two.webp", "one", null)).toBe(
      "loading",
    );
    expect(
      externalImagePreviewStatus(
        "https://images.example.test/one.webp",
        "https://images.example.test/one.webp",
        null,
      ),
    ).toBe("loaded");
  });

  it("explains invalid URLs and remote load failures without changing the input value", () => {
    const invalid = renderToStaticMarkup(
      createElement(ExternalImagePreview, { value: "javascript:alert(1)" }),
    );
    expect(invalid).toContain("Enter a valid HTTP or HTTPS image URL.");
    expect(
      externalImagePreviewStatus(
        "https://images.example.test/missing.webp",
        null,
        "https://images.example.test/missing.webp",
      ),
    ).toBe("failed");
  });
});
