-- Store uploaded bank-transfer proof as immutable object-storage identity.
-- Existing proof_image_url values remain readable for older evidence rows.
alter table funding_capability.funding_evidence
  add column if not exists proof_storage_provider text,
  add column if not exists proof_storage_container text,
  add column if not exists proof_object_key text,
  add column if not exists proof_original_filename text,
  add column if not exists proof_mime_type text,
  add column if not exists proof_byte_size bigint;

alter table funding_capability.funding_evidence
  drop constraint if exists funding_evidence_meaningful_check;

alter table funding_capability.funding_evidence
  add constraint funding_evidence_meaningful_check check (
    nullif(btrim(transfer_reference), '') is not null
    or nullif(btrim(proof_image_url), '') is not null
    or nullif(btrim(customer_note), '') is not null
    or nullif(btrim(proof_object_key), '') is not null
  );
