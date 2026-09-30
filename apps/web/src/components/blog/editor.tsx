"use client";

import { MarkdownEditor } from "../ui/markdown-editor";

export function BlogEditor(props: { markdown: string; onChange: (value: string) => void }) {
  return <MarkdownEditor {...props} />;
}
