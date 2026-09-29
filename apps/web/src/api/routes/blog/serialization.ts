import type { BlogPost } from "@/modules/blog/domain/blog";

export function blogJson(post: BlogPost) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    status: post.status,
    featuredImageUrl: post.featuredImageUrl,
    authorAccountId: post.authorAccountId,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    canonicalUrl: post.canonicalUrl,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    categories: post.categories,
    tags: post.tags,
  };
}
export const operatorBlogJson = blogJson;
