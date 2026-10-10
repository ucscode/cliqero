import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createCatalogueImagePreview,
  newListingExternalKey,
} from "@/components/operator/catalogue";

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

  it("keeps both image-source controls inside one image section before unrelated fields", () => {
    const sectionStart = source.indexOf('htmlFor="listing-image-source"');
    const sectionEnd = source.indexOf('htmlFor="listing-visibility"', sectionStart);
    const imageSection = source.slice(sectionStart, sectionEnd);
    expect(imageSection).toContain('id="listing-external-image-url"');
    expect(imageSection).toContain('htmlFor="listing-staged-media"');
    expect(imageSection).toContain("<ExternalImagePreview value={form.externalImageUrl} />");
    expect(imageSection).toContain("<CatalogueMedia listing={listing} onChange={setListing} />");
  });

  it("keeps submitted values in component state when listing creation fails", () => {
    const save = source.slice(
      source.indexOf("async function save("),
      source.indexOf("function openDraftPreview()"),
    );
    expect(save).toContain("setError(errorMessage(cause))");
    expect(save).not.toContain("setForm(");
    expect(save).not.toContain("form.reset(");
  });
});
