import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  TagSelect,
  addTagValue,
  availableTagOptions,
  moveTagActiveIndex,
  removeTagValue,
} from "@/components/ui/tag-select";

const options = [
  { value: "community", label: "Community" },
  { value: "guides", label: "Guides" },
  { value: "news", label: "News" },
];

describe("TagSelect", () => {
  it("renders controlled selected values as removable chips and an accessible combobox", () => {
    const markup = renderToStaticMarkup(
      <TagSelect label="Categories" options={options} value={["community"]} onChange={vi.fn()} />,
    );

    expect(markup).toContain("Community");
    expect(markup).toContain('aria-label="Remove Community"');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="Categories"');
  });

  it("adds, filters and removes values without allowing duplicates", () => {
    expect(availableTagOptions(options, ["community"], "gui")).toEqual([options[1]]);
    expect(addTagValue(["community"], "guides")).toEqual(["community", "guides"]);
    expect(addTagValue(["community"], "community")).toEqual(["community"]);
    expect(removeTagValue(["community", "guides"], "community")).toEqual(["guides"]);
  });

  it("moves keyboard focus through the filtered options and clamps at both ends", () => {
    expect(moveTagActiveIndex(0, "ArrowDown", 3)).toBe(1);
    expect(moveTagActiveIndex(2, "ArrowDown", 3)).toBe(2);
    expect(moveTagActiveIndex(0, "ArrowUp", 3)).toBe(0);
    expect(moveTagActiveIndex(2, "ArrowUp", 3)).toBe(1);
    expect(moveTagActiveIndex(0, "ArrowDown", 0)).toBe(0);
  });
});
