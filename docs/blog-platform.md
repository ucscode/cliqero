# Cliqero blog platform

The blog is an independent content capability. Blog content lives in a separate
SQLite database (`BLOG_DATABASE_PATH`, default `data/blog/blog.sqlite`) and is
never part of the Cliqero PostgreSQL migration chain. In Docker the file is
mounted at `/workspace/data/blog` through the persistent `blog-data` volume;
back it up as a normal SQLite file. Run `npm run blog:migrate` to initialize it.

Posts store Markdown, rendered with `react-markdown`, `remark-gfm`, and
`rehype-sanitize`. The public site and RSS feed expose published posts only.
The operator/blog-manager editor uses `@mdxeditor/editor`; images are URLs and
are not stored as SQLite blobs. `feed` generates RSS and `slugify` generates
stable unique slugs.

Operators and accounts granted `blog_manager` manage posts. API keys use the
existing principal system with `blog:read`, `blog:write`, `blog:publish`, and
`blog:manage`; scopes never elevate an account role. n8n creates drafts or
publishes through these Hono routes using an `Idempotency-Key`. Idempotency
records are persisted in SQLite, so retries converge without duplicate posts.

Public routes are `/blog`, `/blog/{slug}`, category/tag views, and
`/blog/rss.xml`. Administration is `/operator/blog`. The SQLite schema includes
relational categories, tags, and post-tag links, plus an idempotency table.
