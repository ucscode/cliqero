import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/toast/provider";

describe("ToastProvider", () => {
  it("mounts one viewport outside document flow with a labeled notification region", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <main>Page content</main>
      </ToastProvider>,
    );
    expect(html).toContain("Page content");
    expect(html).toContain('aria-label="Notifications"');
    expect(html).toContain("fixed right-4 top-4");
    expect(html).toContain("pointer-events-none");
  });
});
