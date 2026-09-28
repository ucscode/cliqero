import type { BlogPost } from "@/modules/blog/domain/blog";

export function blogJson(post: BlogPost) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    desiredStatus: post.desiredStatus,
    featuredImageUrl: post.featuredImageUrl,
    authorAccountId: post.authorAccountId,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    canonicalUrl: post.canonicalUrl,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    category: post.category,
    tags: post.tags,
  };
}

export function operatorBlogJson(post: BlogPost) {
  return {
    ...blogJson(post),
    publicationStatus: post.publicationStatus,
    hasWorkingRevision: post.hasWorkingRevision,
    workingRevisionUpdatedAt: post.workingRevisionUpdatedAt?.toISOString() ?? null,
    revisionId: post.revisionId,
  };
}
