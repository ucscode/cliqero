-- Convert the last saved category on each article into a relationship table.
-- 0005 removes the revision tables and attaches the final foreign keys.
create table blog_post_categories (
  post_id text not null,
  category_id text not null,
  primary key(post_id, category_id)
);

insert into blog_post_categories(post_id, category_id)
select p.id, r.category_id
from blog_posts p
join blog_post_revisions r
  on r.id = coalesce(p.working_revision_id, p.published_revision_id)
where r.category_id is not null;
