import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const editorSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/blog/editor.tsx"),
  "utf8",
);

describe("Blog Markdown editor modes", () => {
  it("uses MDXEditor's source mode on the same markdown editor and styles structure", () => {
    expect(editorSource).toContain("mdx.DiffSourceToggleWrapper");
    expect(editorSource).toContain('mdx.diffSourcePlugin({ viewMode: "rich-text" })');
    expect(editorSource).toContain("markdown={markdown}");
    expect(editorSource).toContain("onChange={onChange}");
    expect(editorSource).toContain("allowedHeadingLevels: [2, 3, 4]");
    expect(editorSource).toContain("[&_h2]:text-2xl");
    expect(editorSource).toContain("[&_h3]:text-xl");
    expect(editorSource).toContain("[&_blockquote]:border-l-4");
    expect(editorSource).toContain("[&_ul]:list-disc");
    expect(editorSource).toContain("[&_a]:text-emerald-700");
    expect(editorSource).toContain("[&_pre]:bg-slate-900");
    expect(editorSource).not.toContain("<textarea");
  });
});
