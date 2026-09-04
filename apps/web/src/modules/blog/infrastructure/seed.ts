import { newId } from "@/kernel/ids";
import { getBlogDatabase } from "./database";

if (process.env.NODE_ENV === "production") throw new Error("Blog fixtures are development-only");
const db = getBlogDatabase().sqlite;
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
      : `## A practical note\n\nThis fixture article covers a realistic product topic and gives the layout enough content to review.\n\n[Explore the catalogue](/).`,
  category: index % 3 === 0 ? "Guides" : index % 3 === 1 ? "Product" : "Community",
  tags: index % 2 ? ["product", "access"] : ["guides", "referrals"],
  published: index !== 19,
}));
const categoryId = new Map<string, string>();
const tagId = new Map<string, string>();
const now = Date.now();
const tx = db.transaction(() => {
  for (const post of posts) {
    let category = db.prepare("select id from blog_categories where name=?").get(post.category) as
      { id: string } | undefined;
    if (!category) {
      category = { id: newId() };
      db.prepare("insert into blog_categories(id,slug,name) values(?,?,?)").run(
        category.id,
        post.category.toLowerCase(),
        post.category,
      );
    }
    categoryId.set(post.category, category.id);
    const id =
      (
        db.prepare("select id from blog_posts where slug=?").get(post.slug) as
          { id: string } | undefined
      )?.id ?? newId();
    db.prepare(
      `insert into blog_posts(id,slug,title,excerpt,content_markdown,status,category_id,published_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?) on conflict(slug) do update set title=excluded.title,excerpt=excluded.excerpt,content_markdown=excluded.content_markdown,status=excluded.status,category_id=excluded.category_id,published_at=excluded.published_at,updated_at=excluded.updated_at`,
    ).run(
      id,
      post.slug,
      post.title,
      post.excerpt,
      post.content,
      post.published ? "published" : "draft",
      category.id,
      post.published ? now - posts.indexOf(post) * 86_400_000 : null,
      now - posts.indexOf(post) * 86_400_000,
      now,
    );
    db.prepare("delete from blog_post_tags where post_id=?").run(id);
    for (const name of post.tags) {
      let tag = tagId.get(name)
        ? { id: tagId.get(name)! }
        : (db.prepare("select id from blog_tags where name=?").get(name) as
            { id: string } | undefined);
      if (!tag) {
        tag = { id: newId() };
        db.prepare("insert into blog_tags(id,slug,name) values(?,?,?)").run(tag.id, name, name);
      }
      tagId.set(name, tag.id);
      db.prepare("insert or ignore into blog_post_tags(post_id,tag_id) values(?,?)").run(
        id,
        tag.id,
      );
    }
  }
});
tx();
console.log(
  `Seeded ${posts.length} development blog posts (${posts.filter((post) => post.published).length} published).`,
);
