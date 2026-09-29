"use client";

import dynamic from "next/dynamic";
import "@mdxeditor/editor/style.css";

const Editor = dynamic(
  async () => {
    const mdx = await import("@mdxeditor/editor");
    function ConfiguredEditor(props: {
      markdown: string;
      onChange: (value: string) => void;
      contentEditableClassName: string;
    }) {
      return (
        <mdx.MDXEditor
          {...props}
          plugins={[
            mdx.headingsPlugin({ allowedHeadingLevels: [2, 3, 4] }),
            mdx.listsPlugin(),
            mdx.quotePlugin(),
            mdx.linkPlugin(),
            mdx.thematicBreakPlugin(),
            mdx.codeBlockPlugin(),
            mdx.markdownShortcutPlugin(),
            mdx.toolbarPlugin({
              toolbarContents: () => (
                <mdx.DiffSourceToggleWrapper options={["rich-text", "source"]}>
                  <mdx.UndoRedo />
                  <mdx.Separator />
                  <mdx.BlockTypeSelect />
                  <mdx.Separator />
                  <mdx.BoldItalicUnderlineToggles />
                  <mdx.Separator />
                  <mdx.ListsToggle />
                  <mdx.CreateLink />
                  <mdx.InsertThematicBreak />
                  <mdx.InsertCodeBlock />
                </mdx.DiffSourceToggleWrapper>
              ),
            }),
            mdx.diffSourcePlugin({ viewMode: "rich-text" }),
          ]}
        />
      );
    }
    return ConfiguredEditor;
  },
  {
    ssr: false,
    loading: () => <div className="h-72 animate-pulse rounded-md border bg-slate-50" />,
  },
);

export function BlogEditor({
  markdown,
  onChange,
}: {
  markdown: string;
  onChange: (value: string) => void;
}) {
  return (
    <Editor
      markdown={markdown}
      onChange={onChange}
      contentEditableClassName="min-h-64 max-w-none p-4 [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mt-4 [&_h4]:text-lg [&_h4]:font-semibold [&_p]:my-3 [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-emerald-700 [&_a]:underline [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-slate-100"
    />
  );
}
