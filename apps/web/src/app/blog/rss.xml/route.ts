import { Feed } from "feed";
import { getBlogService } from "@/modules/blog/application/blog-service";
import { siteConfig } from "@/config/site";
export const dynamic = "force-dynamic";
export function GET() {
  const origin = siteConfig.url;
  const feed = new Feed({
    id: `${origin}/blog`,
    title: `${siteConfig.name} Blog`,
    description: `Guides and updates from ${siteConfig.name}`,
    link: `${origin}/blog`,
    language: "en",
    copyright: `© ${new Date().getFullYear()} ${siteConfig.name}`,
  });
  for (const post of getBlogService().list({ publishedOnly: true, limit: 50 }).items)
    feed.addItem({
      id: post.id,
      title: post.title,
      description: post.excerpt,
      link: post.canonicalUrl ?? `${origin}/blog/${post.slug}`,
      date: post.publishedAt ?? post.createdAt,
    });
  return new Response(feed.rss2(), {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
