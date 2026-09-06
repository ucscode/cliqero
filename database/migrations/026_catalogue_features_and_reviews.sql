alter table listing_capability.listings
  add column featured_position integer;

alter table listing_capability.listings
  add constraint listings_featured_position_positive
    check (featured_position is null or featured_position > 0);

create unique index listings_featured_position_unique
  on listing_capability.listings (featured_position)
  where featured_position is not null;

create index listings_public_featured_idx
  on listing_capability.listings (featured_position asc, id asc)
  where state = 'published' and featured_position is not null;

create table listing_capability.reviews (
  id uuid primary key,
  listing_id uuid not null references listing_capability.listings(id),
  account_id uuid not null references identity_capability.accounts(id),
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  moderated_at timestamptz,
  moderated_by uuid references identity_capability.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_reviews_one_per_account unique (listing_id, account_id)
);

create index listing_reviews_public_idx
  on listing_capability.reviews (listing_id, created_at desc, id desc)
  where status = 'approved';
create index listing_reviews_moderation_idx
  on listing_capability.reviews (status, created_at asc, id asc);
