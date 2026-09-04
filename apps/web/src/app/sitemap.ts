import type { MetadataRoute } from "next";
import { getBlogService } from "@/modules/blog/application/blog-service";
import { siteConfig } from "@/config/site";

// Published posts live in the runtime SQLite volume; do not open that mutable
// database during a static production build.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteConfig.url;
  const staticRoutes = [
    "/",
    "/how-it-works",
    "/about",
    "/contact",
    "/faq",
    "/blog",
    "/promote",
    "/privacy",
    "/terms",
  ];
  const posts = getBlogService().list({ publishedOnly: true, limit: 50 }).items;
  return [
    ...staticRoutes.map((route) => ({ url: `${origin}${route}` })),
    ...posts.map((post) => ({ url: `${origin}/blog/${post.slug}`, lastModified: post.updatedAt })),
  ];
}
