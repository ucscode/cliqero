import { BlogMarkdown } from "./markdown";
import type { BlogRenderablePost } from "@/modules/blog/domain/blog";

/* eslint-disable @next/next/no-img-element -- blog media URLs are configured content. */
export function BlogArticle({
  post,
}: {
  post: BlogRenderablePost & { publishedAt?: Date | null };
}) {
  return (
    <article>
      <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {post.categories.map((category) => category.name).join(" · ") || "Cliqero Journal"}
        {post.publishedAt && ` · ${post.publishedAt.toLocaleDateString("en-US")}`}
      </p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
        {post.title}
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">{post.excerpt}</p>
      {post.featuredImageUrl && (
        <img
          src={post.featuredImageUrl}
          alt=""
          className="mt-8 max-h-[30rem] w-full rounded-xl object-cover"
        />
      )}
      <div className="mt-10">
        <BlogMarkdown content={post.content} />
      </div>
    </article>
  );
}
