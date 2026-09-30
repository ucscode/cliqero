import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatorBlogEditor } from "@/components/operator/blog";
import { ToastProvider } from "@/components/toast/provider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("Operator Blog editor actions", () => {
  it("always exposes Preview and a canonical Status field for an unsaved post", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <OperatorBlogEditor />
      </ToastProvider>,
    );
    expect(html).toContain(">Preview</button>");
    expect(html).toContain("Status");
    expect(html).toContain('aria-label="Categories"');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain("multiple=");
    expect(html).toContain(">Save</button>");
    expect(html).not.toContain("Publish changes");
    expect(html).not.toContain("Save &amp; Preview");
  });
});
