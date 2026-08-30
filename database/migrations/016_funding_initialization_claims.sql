alter table funding_capability.funding_transactions
  add column initialization_claimed_at timestamptz;

update funding_capability.funding_transactions
set initialization_claimed_at=updated_at
where state='initializing' and initialization_claimed_at is null;

create index funding_initialization_claimable_idx
  on funding_capability.funding_transactions (state, initialization_claimed_at, updated_at, id)
  where state in ('initialization_pending','initializing');

comment on column funding_capability.funding_transactions.initialization_claimed_at is
  'Lease timestamp for provider initialization. An initializing row is reclaimable only after this timestamp becomes stale.';
