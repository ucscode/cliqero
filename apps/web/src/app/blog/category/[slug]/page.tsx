import { notFound } from "next/navigation";
import { getBlogService } from "@/modules/blog/application/blog-service";
import { BlogIndex } from "../../page";
export const dynamic = "force-dynamic";
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ cursor?: string; trail?: string }>;
}) {
  const { slug } = await params;
  const page = getBlogService().list({ publishedOnly: true, category: slug });
  if (!page.items.length) notFound();
  const query = (await searchParams) ?? {};
  return <BlogIndex category={slug} cursor={query.cursor} trail={query.trail} />;
}
