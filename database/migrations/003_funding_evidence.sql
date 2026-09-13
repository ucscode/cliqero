-- Persisted customer bank-transfer evidence was added to the canonical
-- bootstrap schema. Keep older local PostgreSQL volumes compatible with the
-- same provider-neutral funding workflow.
create table if not exists funding_capability.funding_evidence (
  uuid uuid default gen_random_uuid() not null,
  funding_id bigint not null,
  account_id bigint not null,
  transfer_reference text,
  proof_image_url text,
  customer_note text,
  created_at timestamptz default now() not null,
  id bigint generated always as identity,
  constraint funding_evidence_meaningful_check check (
    nullif(btrim(transfer_reference), '') is not null
    or nullif(btrim(proof_image_url), '') is not null
    or nullif(btrim(customer_note), '') is not null
  ),
  constraint funding_evidence_funding_unique unique (funding_id),
  constraint funding_evidence_funding_fk foreign key (funding_id)
    references funding_capability.funding_transactions(id),
  constraint funding_evidence_account_fk foreign key (account_id)
    references identity_capability.accounts(id)
);

create index if not exists funding_evidence_account_idx
  on funding_capability.funding_evidence (account_id, created_at desc);
