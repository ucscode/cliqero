alter table funding_capability.funding_transactions
  drop constraint funding_state_valid;

alter table funding_capability.funding_transactions
  add constraint funding_state_valid check (
    state = any (array[
      'initialization_pending', 'initializing', 'awaiting_payment',
      'verification_pending', 'confirmed', 'failed', 'blocked', 'cancelled',
      'reconciliation_pending'
    ])
  );
