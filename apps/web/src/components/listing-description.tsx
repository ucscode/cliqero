import { unified } from "unified";
import remarkParse from "remark-parse";
import stripMarkdown from "strip-markdown";
import type { Root } from "mdast";
import { cn } from "@/lib/utils";

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[] };

function withoutImages(node: MarkdownNode): MarkdownNode {
  return {
    ...node,
    children: node.children?.filter((child) => child.type !== "image").map(withoutImages),
  };
}

function plainText(node: MarkdownNode): string {
  if (node.value) return node.value;
  return node.children?.map(plainText).join(" ") ?? "";
}

export function listingDescription(description: string): string {
  const source = description.trim();
  if (!source) return "";
  const tree = withoutImages(unified().use(remarkParse).parse(source) as MarkdownNode) as Root;
  const plain = unified().use(stripMarkdown).runSync(tree) as MarkdownNode;
  return plainText(plain).replace(/\s+/g, " ").trim();
}

export function ListingDescription({
  description,
  className,
}: {
  description: string;
  className?: string;
}) {
  const excerpt = listingDescription(description);
  if (!excerpt) return null;
  return <p className={cn("line-clamp-3", className)}>{excerpt}</p>;
}
