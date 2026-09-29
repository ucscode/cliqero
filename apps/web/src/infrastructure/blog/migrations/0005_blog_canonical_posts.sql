-- Replace revision pointers with the canonical editable post row. For posts that
-- were published with later saved edits, the latest working content is retained.
create table blog_posts_canonical (
  id text primary key not null,
  slug text not null unique,
  title text not null,
  excerpt text not null,
  content_markdown text not null,
  status text not null default 'draft' check (status in ('draft','published')),
  featured_image_url text,
  author_account_id text,
  seo_title text,
  seo_description text,
  canonical_url text,
  published_at integer,
  created_at integer not null,
  updated_at integer not null
);

insert into blog_posts_canonical(
  id,slug,title,excerpt,content_markdown,status,featured_image_url,author_account_id,
  seo_title,seo_description,canonical_url,published_at,created_at,updated_at
)
select p.id,r.slug,r.title,r.excerpt,r.content_markdown,p.publication_state,
  r.featured_image_url,p.author_account_id,r.seo_title,r.seo_description,r.canonical_url,
  p.published_at,p.created_at,max(p.updated_at,r.updated_at)
from blog_posts p
join blog_post_revisions r on r.id=coalesce(p.working_revision_id,p.published_revision_id);

create table blog_post_categories_migration (
  post_id text not null,
  category_id text not null,
  primary key(post_id,category_id)
);
insert into blog_post_categories_migration select post_id,category_id from blog_post_categories;

create table blog_post_tags_migration (
  post_id text not null,
  tag_id text not null,
  primary key(post_id,tag_id)
);
insert into blog_post_tags_migration(post_id,tag_id)
select p.id,rt.tag_id
from blog_posts p
join blog_post_revisions r on r.id=coalesce(p.working_revision_id,p.published_revision_id)
join blog_post_revision_tags rt on rt.revision_id=r.id;

drop table blog_post_categories;
drop table blog_post_revision_tags;
drop table blog_post_revisions;
drop table blog_posts;
alter table blog_posts_canonical rename to blog_posts;

create index blog_posts_status_created_idx on blog_posts(status,created_at desc,id desc);
create table blog_post_categories (
  post_id text not null references blog_posts(id) on delete cascade,
  category_id text not null references blog_categories(id) on delete restrict,
  primary key(post_id,category_id)
);
insert into blog_post_categories select post_id,category_id from blog_post_categories_migration;
drop table blog_post_categories_migration;

create table blog_post_tags (
  post_id text not null references blog_posts(id) on delete cascade,
  tag_id text not null references blog_tags(id) on delete cascade,
  primary key(post_id,tag_id)
);
insert into blog_post_tags select post_id,tag_id from blog_post_tags_migration;
drop table blog_post_tags_migration;
