import { Feed } from "feed";
import { getBlogService } from "@/modules/blog/application/blog-service";
export const dynamic = "force-dynamic";
export function GET() {
  const origin = process.env.APP_URL ?? "http://localhost:3000";
  const feed = new Feed({
    id: `${origin}/blog`,
    title: "Cliqero Blog",
    description: "Guides and updates from Cliqero",
    link: `${origin}/blog`,
    language: "en",
    copyright: `© ${new Date().getFullYear()} Cliqero`,
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
