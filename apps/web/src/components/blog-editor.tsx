"use client";

import dynamic from "next/dynamic";
import "@mdxeditor/editor/style.css";

const Editor = dynamic(() => import("@mdxeditor/editor").then((module) => module.MDXEditor), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-md border bg-slate-50" />,
});

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
