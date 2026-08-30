alter table listing_capability.media
  add column transfer_identity text,
  add column deletion_attempt_count integer not null default 0 check (deletion_attempt_count >= 0),
  add column deletion_next_attempt_at timestamptz,
  add column deletion_claimed_at timestamptz,
  add column deletion_lease_until timestamptz;

-- Existing galleries may contain duplicate/gapped positions. Normalize them
-- before enforcing the active-gallery ordering invariant.
with ordered as (
  select id, row_number() over (partition by listing_id order by position,created_at,id)-1 as position
  from listing_capability.media where state='active'
)
update listing_capability.media media set position=ordered.position
from ordered where media.id=ordered.id;

create unique index listing_media_active_position_unique
  on listing_capability.media(listing_id,position) where state='active';
create unique index listing_media_active_transfer_identity_unique
  on listing_capability.media(listing_id,transfer_identity)
  where state='active' and transfer_identity is not null;

drop index listing_capability.listing_media_deletion_work_idx;
create index listing_media_deletion_due_idx
  on listing_capability.media(deletion_next_attempt_at,deletion_lease_until,id)
  where state='deletion_pending';

comment on column listing_capability.media.transfer_identity is
  'Stable owner-scoped transfer identity used to reconcile imported galleries; not a storage locator.';
