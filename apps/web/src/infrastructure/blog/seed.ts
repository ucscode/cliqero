import { BlogService } from "@/application/blog/service";
import { SqliteBlogRepository } from "./repository";
import { getBlogDatabase } from "./database";

if (process.env.NODE_ENV === "production") throw new Error("Blog fixtures are development-only");
const service = new BlogService(new SqliteBlogRepository(getBlogDatabase().sqlite));
const posts = Array.from({ length: 20 }, (_, index) => ({
  slug: `fixture-guide-${index + 1}`,
  title: index === 0 ? "How to get more from a useful catalogue" : `Development guide ${index + 1}`,
  excerpt:
    index % 2
      ? "A short practical note for reviewing the Cliqero experience."
      : "A longer fixture excerpt that exercises cards, metadata and responsive blog layouts.",
  content:
    index === 0
      ? "# Start here\n\nDiscover a listing, fund your wallet, and choose access.\n\n- Browse\n- Buy\n- Access\n\n```ts\nconst useful = true;\n```"
      : "## A practical note\n\nThis fixture article covers a realistic product topic and gives the layout enough content to review.\n\n[Explore the catalogue](/).",
  category: index % 3 === 0 ? "Guides" : index % 3 === 1 ? "Product" : "Community",
  tags: index % 2 ? ["product", "access"] : ["guides", "referrals"],
  published: index !== 19,
}));

for (const fixture of posts) {
  const category =
    service.categories().find((item) => item.name === fixture.category) ??
    service.createCategory(fixture.category);
  const current = service.get(fixture.slug);
  const desiredStatus = fixture.published ? "published" : "draft";
  if (!current) {
    const created = service.create(
      {
        slug: fixture.slug,
        title: fixture.title,
        excerpt: fixture.excerpt,
        content: fixture.content,
        desired_status: desiredStatus,
        category_id: category.id,
        tags: fixture.tags,
      },
      null,
    );
    if (created && fixture.published) service.publish(created.id);
    continue;
  }
  const same =
    current.title === fixture.title &&
    current.excerpt === fixture.excerpt &&
    current.content === fixture.content &&
    current.category?.id === category.id &&
    current.tags
      .map((tag) => tag.name)
      .sort()
      .join(",") === [...fixture.tags].sort().join(",") &&
    current.desiredStatus === desiredStatus;
  if (!same) {
    service.save(
      current.id,
      {
        slug: fixture.slug,
        title: fixture.title,
        excerpt: fixture.excerpt,
        content: fixture.content,
        desired_status: desiredStatus,
        category_id: category.id,
        tags: fixture.tags,
      },
      null,
    );
  }
  const refreshed = service.get(current.id);
  if (refreshed && refreshed.publicationStatus !== desiredStatus)
    service.applyStatus(current.id, desiredStatus);
  else if (refreshed?.hasWorkingRevision && desiredStatus === "published")
    service.applyStatus(current.id, "published");
}

console.log(
  `Seeded ${posts.length} development blog posts (${posts.filter((post) => post.published).length} published).`,
);
