import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components: Components = {
  a: ({ href, children, ...props }) => {
    const external = Boolean(href && /^https?:\/\//i.test(href));
    return (
      <a
        href={href}
        {...props}
        {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      >
        {children}
      </a>
    );
  },
  img: ({ alt, ...props }) => <img {...props} alt={alt ?? ""} loading="lazy" />,
  table: ({ children, ...props }) => (
    <div className="my-6 max-w-full overflow-x-auto">
      <table {...props}>{children}</table>
    </div>
  ),
};

export function ListingMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-none break-words text-base leading-8 text-slate-700",
        "[&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-emerald-300 [&_a]:hover:decoration-emerald-700",
        "[&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-200 [&_blockquote]:pl-4 [&_blockquote]:italic",
        "[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]",
        "[&_h1]:!mt-10 [&_h1]:!text-3xl [&_h1]:!font-semibold [&_h1]:!leading-tight [&_h1]:!tracking-tight",
        "[&_h2]:!mt-10 [&_h2]:!text-2xl [&_h2]:!font-semibold [&_h2]:!leading-tight [&_h2]:!tracking-tight",
        "[&_h3]:!mt-8 [&_h3]:!text-xl [&_h3]:!font-semibold [&_h3]:!leading-tight [&_h3]:!tracking-tight",
        "[&_img]:my-8 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg",
        "[&_li]:my-2 [&_ol]:my-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-5",
        "[&_pre]:my-6 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-950 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-6 [&_pre]:text-slate-100",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
        "[&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:p-2 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:p-2",
        "[&_ul]:my-6 [&_ul]:list-disc [&_ul]:pl-6",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
