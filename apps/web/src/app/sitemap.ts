import type { MetadataRoute } from "next";
import { getBlogService } from "@/modules/blog/application/blog-service";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.APP_URL ?? "http://localhost:3000";
  const staticRoutes = [
    "/",
    "/how-it-works",
    "/about",
    "/contact",
    "/faq",
    "/blog",
    "/privacy",
    "/terms",
  ];
  const posts = getBlogService().list({ publishedOnly: true, limit: 50 }).items;
  return [
    ...staticRoutes.map((route) => ({ url: `${origin}${route}` })),
    ...posts.map((post) => ({ url: `${origin}/blog/${post.slug}`, lastModified: post.updatedAt })),
  ];
}
