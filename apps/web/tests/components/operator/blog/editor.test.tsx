import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatorBlogEditor } from "@/components/operator/blog";
import { ToastProvider } from "@/components/toast/provider";
import { OperatorConfirmationProvider } from "@/components/operator/ui/confirmation";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("Operator Blog editor actions", () => {
  it("always exposes Preview and a canonical Status field for an unsaved post", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <OperatorConfirmationProvider>
          <OperatorBlogEditor />
        </OperatorConfirmationProvider>
      </ToastProvider>,
    );
    expect(html).toContain(">Preview</button>");
    expect(html).toContain("Status");
    expect(html).toContain('aria-label="Categories"');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain("multiple=");
    expect(html).toContain(">Save</button>");
    expect(html).not.toContain("Manage categories");
    expect(html).not.toContain("Publish changes");
    expect(html).not.toContain("Save &amp; Preview");
    expect(html).not.toContain("Manage categories");
    const source = readFileSync(
      resolve(process.cwd(), "src/components/operator/blog/index.tsx"),
      "utf8",
    );
    expect(source).toContain("operatorPreviewWindowName(");
    expect(source).toContain("preview_id: previewId");
    expect(source).toContain("revision=${Date.now()}");
    expect(source).toContain("...requestBody(), preview_id: previewId");
    expect(source).toContain('label: "Edit"');
  });
});
