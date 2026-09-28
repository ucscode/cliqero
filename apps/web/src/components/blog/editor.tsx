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
            mdx.headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4] }),
            mdx.listsPlugin(),
            mdx.quotePlugin(),
            mdx.linkPlugin(),
            mdx.thematicBreakPlugin(),
            mdx.codeBlockPlugin(),
            mdx.markdownShortcutPlugin(),
            mdx.toolbarPlugin({
              toolbarContents: () => (
                <>
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
                </>
              ),
            }),
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
      contentEditableClassName="prose max-w-none min-h-64 p-4"
    />
  );
}
