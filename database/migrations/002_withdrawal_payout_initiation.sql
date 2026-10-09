-- Add the withdrawal payout evidence model to databases created from the
-- previous 001 baseline. Safe to re-run; no historical rows are synthesized.
BEGIN;

CREATE TABLE IF NOT EXISTS withdrawal_capability.payout_initiations (
    uuid uuid NOT NULL,
    withdrawal_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    correlation_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    external_reference text,
    created_at timestamptz NOT NULL DEFAULT now(),
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CONSTRAINT payout_initiations_uuid_unique UNIQUE (uuid),
    CONSTRAINT payout_initiations_withdrawal_unique UNIQUE (withdrawal_id),
    CONSTRAINT payout_initiations_idempotency_unique UNIQUE (idempotency_key),
    CONSTRAINT payout_initiations_idempotency_valid CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    CONSTRAINT payout_initiations_reference_length CHECK (external_reference IS NULL OR length(external_reference) <= 200),
    CONSTRAINT payout_initiations_withdrawal_fk FOREIGN KEY (withdrawal_id)
      REFERENCES withdrawal_capability.withdrawals(id) ON DELETE RESTRICT,
    CONSTRAINT payout_initiations_actor_fk FOREIGN KEY (actor_id)
      REFERENCES identity_capability.accounts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS payout_initiations_history_idx
  ON withdrawal_capability.payout_initiations (withdrawal_id, created_at DESC, id DESC);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='payout_initiations_append_only'
      AND tgrelid='withdrawal_capability.payout_initiations'::regclass
  ) THEN
    CREATE TRIGGER payout_initiations_append_only
      BEFORE UPDATE OR DELETE ON withdrawal_capability.payout_initiations
      FOR EACH ROW EXECUTE FUNCTION ledger_capability.prevent_entry_mutation();
  END IF;
END $$;
COMMENT ON TABLE withdrawal_capability.payout_initiations IS
  'Append-only operator attestation that the payout workflow was started before external submission; not evidence of provider acceptance or settlement.';

CREATE TABLE IF NOT EXISTS withdrawal_capability.payout_failures (
    uuid uuid NOT NULL,
    withdrawal_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    correlation_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    external_reference text NOT NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CONSTRAINT payout_failures_uuid_unique UNIQUE (uuid),
    CONSTRAINT payout_failures_withdrawal_unique UNIQUE (withdrawal_id),
    CONSTRAINT payout_failures_idempotency_unique UNIQUE (idempotency_key),
    CONSTRAINT payout_failures_idempotency_valid CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    CONSTRAINT payout_failures_reference_nonempty CHECK (length(btrim(external_reference)) > 0 AND length(external_reference) <= 200),
    CONSTRAINT payout_failures_reason_valid CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
    CONSTRAINT payout_failures_withdrawal_fk FOREIGN KEY (withdrawal_id)
      REFERENCES withdrawal_capability.withdrawals(id) ON DELETE RESTRICT,
    CONSTRAINT payout_failures_actor_fk FOREIGN KEY (actor_id)
      REFERENCES identity_capability.accounts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS payout_failures_history_idx
  ON withdrawal_capability.payout_failures (withdrawal_id, created_at DESC, id DESC);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='payout_failures_append_only'
      AND tgrelid='withdrawal_capability.payout_failures'::regclass
  ) THEN
    CREATE TRIGGER payout_failures_append_only
      BEFORE UPDATE OR DELETE ON withdrawal_capability.payout_failures
      FOR EACH ROW EXECUTE FUNCTION ledger_capability.prevent_entry_mutation();
  END IF;
END $$;
COMMENT ON TABLE withdrawal_capability.payout_failures IS
  'Append-only operator evidence of confirmed payout non-delivery; the linked reservation release and fee reversal are atomic.';

COMMIT;
