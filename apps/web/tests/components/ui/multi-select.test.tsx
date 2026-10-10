import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MultiSelect, multiSelectInstanceId } from "@/components/ui/multi-select";

describe("MultiSelect hydration identity", () => {
  it("derives a stable react-select instance identifier from the component input id", () => {
    expect(multiSelectInstanceId("listing-categories", "Categories")).toBe("listing-categories");
    expect(multiSelectInstanceId(undefined, "Blog Tags")).toBe("cliqero-blog-tags");
  });

  it("renders matching live-region identifiers on repeated server renders", () => {
    const props = {
      label: "Categories",
      inputId: "listing-categories",
      options: [{ value: "one", label: "One" }],
      value: [] as string[],
      onChange: () => {},
    };
    const first = renderToStaticMarkup(<MultiSelect {...props} />);
    const second = renderToStaticMarkup(<MultiSelect {...props} />);
    expect(first).toContain('id="react-select-listing-categories-live-region"');
    expect(second).toContain('id="react-select-listing-categories-live-region"');
    expect(first).toBe(second);
  });
});
