import { readFileSync } from "node:fs";
import { compile, run } from "@mdx-js/mdx";
import { renderToStaticMarkup } from "react-dom/server";
import * as runtime from "react/jsx-runtime";
import { describe, expect, it, vi } from "vitest";
import remarkYamlFrontmatter from "../../remark-frontmatter.mjs";
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

  it("does not render YAML front matter in compiled MDX content", async () => {
    const source = readFileSync(new URL("../../content/pages/about.mdx", import.meta.url), "utf8");
    const compiled = await compile(
      { value: source, path: "about.mdx" },
      { outputFormat: "function-body", remarkPlugins: [remarkYamlFrontmatter] },
    );
    const { default: Content } = await run(compiled, runtime);
    const output = renderToStaticMarkup(
      <Content components={{ SiteName: () => <span>Cliqero</span> }} />,
    );

    expect(output).toContain("A practical catalogue for digital products");
    expect(output).toContain("Cliqero");
    expect(output).not.toContain("title: About");
    expect(output).not.toContain("description: Discover useful digital products");
    expect(output).not.toContain("updated: 2026-09-06");
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
