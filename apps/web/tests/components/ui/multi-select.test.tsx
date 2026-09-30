import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MultiSelect } from "@/components/ui/multi-select";

describe("MultiSelect dependency adapter", () => {
  it("renders a controlled searchable multi-select with compact neutral selected values", () => {
    const html = renderToStaticMarkup(
      <MultiSelect
        label="Categories"
        options={[
          { value: "design", label: "Design" },
          { value: "tools", label: "Tools" },
        ]}
        value={["design"]}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("Categories");
    expect(html).toContain("Design");
    expect(html).toContain("react-select");
  });
});
