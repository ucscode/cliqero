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

The operator API is role and scope protected: treasury reads require an
operator and `treasury:read` for API keys; manual writes require an operator and
`treasury:manage`. Scopes restrict an account's authority and never elevate a
catalogue manager or ordinary account. History is bounded and keyset-paginated;
automatic distribution entries link back to the distribution for traceability.
