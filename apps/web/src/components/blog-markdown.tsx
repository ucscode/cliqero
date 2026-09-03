import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export function BlogMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-slate max-w-none break-words [&_img]:max-w-full [&_pre]:overflow-x-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
