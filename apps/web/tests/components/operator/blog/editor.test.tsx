import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatorBlogEditor } from "@/components/operator/blog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("Operator Blog editor actions", () => {
  it("always exposes Preview and a canonical Status field for an unsaved post", () => {
    const html = renderToStaticMarkup(<OperatorBlogEditor />);
    expect(html).toContain(">Preview</button>");
    expect(html).toContain("Status");
    expect(html).toContain('id="blog-categories"');
    expect(html).toContain("multiple=");
    expect(html).toContain(">Save</button>");
    expect(html).not.toContain("Publish changes");
    expect(html).not.toContain("Save &amp; Preview");
  });
});
