import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createCatalogueImagePreview,
  newListingExternalKey,
} from "@/components/operator/catalogue";
import { OperatorCatalogueDraftPreview } from "@/components/operator/catalogue";
import { renderToStaticMarkup } from "react-dom/server";

describe("catalogue image preview", () => {
  it("uses a local object URL and revokes it when the preview is released", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const file = new File(["image bytes"], "listing.png", { type: "image/png" });

    const preview = createCatalogueImagePreview(file);
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(preview).toMatchObject({ file, previewUrl: "blob:preview" });

    preview.dispose();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});

describe("catalogue external keys", () => {
  it("generates unique URL-safe keys for new listings", () => {
    const first = newListingExternalKey();
    const second = newListingExternalKey();
    expect(first).toMatch(/^listing-[a-f0-9]{32}$/);
    expect(second).toMatch(/^listing-[a-f0-9]{32}$/);
    expect(second).not.toBe(first);
  });
});

describe("catalogue editor image and error behavior", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/operator/catalogue.tsx"),
    "utf8",
  );

  it("offers none, uploaded, and external sources in one stable Listing image field", () => {
    const sectionStart = source.indexOf('htmlFor="listing-image-source"');
    const sectionEnd = source.indexOf('htmlFor="listing-visibility"', sectionStart);
    const imageSection = source.slice(sectionStart, sectionEnd);
    expect(imageSection).toContain('<option value="none">None</option>');
    expect(imageSection).toContain('<option value="uploaded">Uploaded image</option>');
    expect(imageSection).toContain('<option value="external">External image URL</option>');
    expect(imageSection).toContain('id="listing-image"');
    expect(imageSection).toContain(">Listing image</Label>");
    expect(imageSection).toContain("<ExternalImagePreview value={form.externalImageUrl} />");
    expect(imageSection).toContain("<CatalogueMedia listing={listing} onChange={setListing} />");
    expect(imageSection).toContain('clearFieldErrors("image_source", "external_image_url")');
    expect(imageSection).toContain("Existing uploaded images are preserved");
    expect(imageSection).not.toContain("delete metadata.external_image_url");
  });

  it("keeps submitted values in component state when listing creation fails", () => {
    const save = source.slice(
      source.indexOf("async function save("),
      source.indexOf("function openDraftPreview()"),
    );
    expect(save).toContain("We couldn't save the listing. Please try again.");
    expect(save).not.toContain("setForm(");
    expect(save).not.toContain("form.reset(");
  });

  it("renders a loading state before client-side draft storage is read", () => {
    const html = renderToStaticMarkup(createElement(OperatorCatalogueDraftPreview));
    expect(html).toContain("Loading preview");
    expect(html).not.toContain("Preview unavailable");
  });
});
