import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/toast/provider";

describe("library-backed toast adapter", () => {
  it("mounts the single library container outside document flow", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <main>Page content</main>
      </ToastProvider>,
    );
    expect(html).toContain("Page content");
    expect(html).toContain("Toastify");
  });
});
