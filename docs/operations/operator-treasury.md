# Operator Treasury

Treasury is Cliqero's company-owned USD projection. It is separate from buyer
wallet deposits and user referral earnings. The authoritative balance is the
sum of immutable append-only credits minus debits; there is no mutable balance,
edit, or delete operation.

Completed wallet-first distributions persist a platform allocation. The
treasury processor independently creates one source-linked automatic credit
(`source_kind=distribution`) from that persisted amount. It never recalculates
commission policy and a processor failure does not invalidate a distribution.

Operators can append a positive manual credit or debit. The authenticated
operator is recorded as `actor_id`; source fields are null. Corrections are
ordinary opposite-direction entries with an explanatory note. Requests use an
`Idempotency-Key`, so retries with the same semantic request converge to one
fact and conflicting reuse is rejected.

The operator API is capability and scope protected: treasury reads require the
`treasury.manage` capability and `treasury:read` for API keys; manual writes require
the same capability and
`treasury:manage`. Scopes restrict an account's authority and never elevate a
catalogue operator or ordinary account. History is bounded and keyset-paginated;
automatic distribution entries link back to the distribution for traceability.

## Traceability and historical entries

Every newly written Treasury fact records its source kind/ID, actor kind, and
correlation ID. Customer and operator actions identify the corresponding
account; worker-created allocations use `System / automated` and do not invent
an account actor. Related ledger, outbox, and audit records share the operation
correlation. A later correction or compensation has its own correlation and
retains the original source ID.

The Operator list exposes correlation IDs for copying and exact lookup through
the existing search field. Known source types link to their existing detail
pages; sources without an existing detail page retain their human-readable
label and source ID.

Older append-only entries may have no correlation or actor-kind value. Do not
fill these with the Treasury entry UUID or a newly generated value. Deterministic
recovery is possible only when the source record survives and provides an exact
correlation: distributions through `purchase_distributions.correlation_id`,
wallet transfers through `transfers.correlation_id`, adjustments through the
matching adjustment row, and compensations through their compensation row.
Withdrawal fee reversals require the corresponding operation's immutable audit
or outbox evidence; the withdrawal's original correlation alone is not proof
of a later reversal's correlation. If the source or unique operation evidence
is gone, leave the historical value unrecorded.

Treasury entries are append-only and the source ID is polymorphic, so no normal
application update can safely repair historical facts. Any future proven
backfill requires a separately reviewed, privileged maintenance procedure that
matches immutable source evidence, records an operator/audit trail, and verifies
balances before and after. No unprovable row should be changed.
