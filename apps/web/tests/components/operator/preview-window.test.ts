import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openOperatorPreviewWindow,
  operatorPreviewWindowName,
} from "@/components/operator/ui/preview-window";

describe("Operator preview windows", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses independent stable names for each preview owner and reuses the supplied name", () => {
    expect(operatorPreviewWindowName("catalogue", "listing-1")).toBe(
      "cliqero-catalogue-preview-listing-1",
    );
    expect(operatorPreviewWindowName("blog", "post-1")).toBe("cliqero-blog-preview-post-1");
    const open = vi.fn(() => ({ opener: {} as Window | null }));
    vi.stubGlobal("window", { open });
    const name = operatorPreviewWindowName("blog", "editor-session");

    const first = openOperatorPreviewWindow("about:blank", name);
    const second = openOperatorPreviewWindow("about:blank", name);

    expect(open).toHaveBeenNthCalledWith(1, "about:blank", name);
    expect(open).toHaveBeenNthCalledWith(2, "about:blank", name);
    expect(first?.opener).toBeNull();
    expect(second?.opener).toBeNull();
  });
});
