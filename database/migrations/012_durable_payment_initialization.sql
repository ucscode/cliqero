alter table payment_capability.payments
  add column initialization_attempt_count integer not null default 0,
  add column initialization_last_attempt_at timestamptz,
  add column initialization_next_attempt_at timestamptz,
  add column initialization_failure_kind text,
  add column initialization_last_error text;
alter table payment_capability.payments drop constraint payments_state_valid;
alter table payment_capability.payments add constraint payments_state_valid check (state in ('pending','initialization_pending','initializing','awaiting_payment','verification_pending','verifying','initialization_failed','initialization_blocked','verification_blocked','reconciliation_pending','verified','failed'));
alter table payment_capability.provider_operations drop constraint provider_operations_outcome_check;
alter table payment_capability.provider_operations add constraint provider_operations_outcome_check check (outcome in ('failed','succeeded'));
