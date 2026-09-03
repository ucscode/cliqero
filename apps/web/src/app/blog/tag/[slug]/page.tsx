import { notFound } from "next/navigation";
import { getBlogService } from "@/modules/blog/application/blog-service";
import { BlogIndex } from "../../page";
export const dynamic = "force-dynamic";
export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ cursor?: string }>;
}) {
  const { slug } = await params;
  const page = getBlogService().list({ publishedOnly: true, tag: slug });
  if (!page.items.length) notFound();
  return <BlogIndex tag={slug} cursor={(await searchParams)?.cursor} />;
}
