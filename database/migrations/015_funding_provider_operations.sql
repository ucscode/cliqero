alter table payment_capability.provider_operations alter column payment_id drop not null;
alter table payment_capability.provider_operations add column funding_id uuid references funding_capability.funding_transactions(id);
alter table payment_capability.provider_operations alter column provider_message drop not null;
alter table payment_capability.provider_operations alter column failure_kind drop not null;
alter table payment_capability.provider_operations add constraint provider_operations_subject_check
  check ((payment_id is not null)::integer + (funding_id is not null)::integer = 1);
alter table payment_capability.provider_operations add constraint provider_operations_failure_fields_check
  check ((outcome='failed' and provider_message is not null and failure_kind is not null) or (outcome='succeeded' and failure_kind is null));
create index provider_operations_funding_idx on payment_capability.provider_operations(funding_id,occurred_at desc) where funding_id is not null;
