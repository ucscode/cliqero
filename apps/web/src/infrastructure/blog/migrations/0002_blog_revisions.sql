-- Preserve each existing article as its first immutable revision, then reduce
-- blog_posts to article identity and publication pointers.
create table blog_posts_revised (
  id text primary key not null,
  publication_state text not null check (publication_state in ('draft', 'published')),
  author_account_id text,
  published_at integer,
  created_at integer not null,
  updated_at integer not null,
  published_revision_id text references blog_post_revisions(id),
  working_revision_id text references blog_post_revisions(id)
);

insert into blog_posts_revised(id, publication_state, author_account_id, published_at, created_at, updated_at)
select id, status, author_account_id, published_at, created_at, updated_at from blog_posts;

create table blog_post_revisions (
  id text primary key not null,
  post_id text not null references blog_posts_revised(id) on delete cascade,
  revision_number integer not null,
  slug text not null,
  title text not null,
  excerpt text not null,
  content_markdown text not null,
  desired_status text not null check (desired_status in ('draft', 'published')),
  featured_image_url text,
  seo_title text,
  seo_description text,
  canonical_url text,
  category_id text references blog_categories(id) on delete restrict,
  created_by_account_id text,
  created_at integer not null,
  updated_at integer not null,
  unique(post_id, revision_number)
);
create unique index blog_categories_name_ci_unique on blog_categories(name collate nocase);
create index blog_post_revisions_slug_idx on blog_post_revisions(slug);
create index blog_post_revisions_post_created_idx on blog_post_revisions(post_id, created_at desc);

create table blog_post_revision_tags (
  revision_id text not null references blog_post_revisions(id) on delete cascade,
  tag_id text not null references blog_tags(id) on delete cascade,
  primary key (revision_id, tag_id)
);

insert into blog_post_revisions(
  id, post_id, revision_number, slug, title, excerpt, content_markdown,
  desired_status, featured_image_url, seo_title, seo_description, canonical_url,
  category_id, created_by_account_id, created_at, updated_at
)
select p.id || '-r1', p.id, 1, p.slug, p.title, p.excerpt, p.content_markdown,
  p.status, p.featured_image_url, p.seo_title, p.seo_description, p.canonical_url,
  case when c.id is not null then p.category_id else null end,
  p.author_account_id, p.created_at, p.updated_at
from blog_posts p left join blog_categories c on c.id = p.category_id;

insert into blog_post_revision_tags(revision_id, tag_id)
select pt.post_id || '-r1', pt.tag_id from blog_post_tags pt;

update blog_posts_revised
set published_revision_id = case when publication_state = 'published' then id || '-r1' else null end,
    working_revision_id = case when publication_state = 'draft' then id || '-r1' else null end;

drop table blog_post_tags;
drop table blog_posts;
alter table blog_posts_revised rename to blog_posts;

create index blog_posts_publication_created_idx on blog_posts(publication_state, created_at desc, id desc);
