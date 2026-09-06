import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadContentDocument } from "./loader";

vi.mock("../../content/pages/about.mdx", () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div>{children ?? "About content"}</div>
  ),
}));
vi.mock("../../content/test/plain-example.md", () => ({
  default: () => <div>Plain Markdown content</div>,
}));

describe("web content loader", () => {
  it("loads MDX metadata and a renderable component together", async () => {
    const document = await loadContentDocument("pages/about.mdx");
    const output = renderToStaticMarkup(<document.Content />);

    expect(document.meta.title).toBe("About");
    expect(document.meta.description).toContain("digital products");
    expect(document.meta.updated).toBe("2026-09-06");
    expect(output).toContain("About content");
  });

  it("supports plain Markdown through the same loader", async () => {
    const document = await loadContentDocument("test/plain-example.md");
    const output = renderToStaticMarkup(<document.Content />);

    expect(document.meta.title).toBe("Plain example");
    expect(output).toContain("Plain Markdown content");
  });

  it("rejects unsupported extensions, traversal, and missing documents", async () => {
    await expect(loadContentDocument("pages/about.txt")).rejects.toThrow(
      "Unsupported content extension",
    );
    await expect(loadContentDocument("../escape.mdx")).rejects.toThrow(
      "Content path escapes apps/web/content",
    );
    await expect(loadContentDocument("pages/missing.mdx")).rejects.toThrow(
      "Content document not found",
    );
  });
});
