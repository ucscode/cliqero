-- Some long-lived development databases applied an early draft of migration 012.
-- Normalize the legacy payment constraint without changing historical records.
alter table payment_capability.payments drop constraint if exists payments_state_valid;
alter table payment_capability.payments add constraint payments_state_valid check (state in
  ('pending','initialization_pending','initializing','awaiting_payment','verification_pending','verifying',
   'initialization_failed','initialization_blocked','verification_blocked','reconciliation_pending','verified','failed'));
