import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const editorSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/blog/editor.tsx"),
  "utf8",
);
const sharedEditorSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/ui/markdown-editor.tsx"),
  "utf8",
);

describe("Blog Markdown editor modes", () => {
  it("delegates Blog editing to the shared rich/source Markdown editor", () => {
    expect(editorSource).toContain('import { MarkdownEditor } from "../ui/markdown-editor"');
    expect(editorSource).toContain("return <MarkdownEditor {...props} />");
    expect(sharedEditorSource).toContain("mdx.DiffSourceToggleWrapper");
    expect(sharedEditorSource).toContain('mdx.diffSourcePlugin({ viewMode: "rich-text" })');
    expect(sharedEditorSource).toContain("markdown={markdown}");
    expect(sharedEditorSource).toContain("onChange={onChange}");
    expect(sharedEditorSource).toContain("allowedHeadingLevels: [2, 3, 4]");
    expect(sharedEditorSource).toContain("[&_h2]:text-2xl");
    expect(sharedEditorSource).toContain("[&_h3]:text-xl");
    expect(sharedEditorSource).toContain("[&_blockquote]:border-l-4");
    expect(sharedEditorSource).toContain("[&_ul]:list-disc");
    expect(sharedEditorSource).toContain("[&_a]:text-emerald-700");
    expect(sharedEditorSource).toContain("[&_pre]:bg-slate-900");
    expect(sharedEditorSource).not.toContain("<textarea");
  });
});
