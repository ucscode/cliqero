import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";

export function PaymentInstructions({
  content,
  className,
}: {
  content?: string | null;
  className?: string;
}) {
  if (!content) return null;
  return (
    <div
      className={cn(
        "text-sm text-slate-600",
        "[&_p]:m-0 [&_p+p]:mt-3 [&_strong]:font-semibold [&_strong]:text-slate-900",
        className,
      )}
    >
      <ReactMarkdown
        allowedElements={["p", "strong", "em", "br"]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
