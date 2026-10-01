import { describe, expect, it, vi } from "vitest";
import { createCatalogueImagePreview } from "@/components/operator/catalogue";

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
