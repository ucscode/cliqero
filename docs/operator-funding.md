# Operator funding inspection

The operator Funding surface is a read-only inspection view over the
provider-neutral `funding_capability.funding_transactions` facts. External
providers fund a user's buyer wallet; they do not purchase listings directly.

Funding progresses through the persisted states:

`initialization_pending` → `initializing` → `awaiting_payment` →
`verification_pending` → `confirmed`

`failed`, `blocked`, and `reconciliation_pending` are distinct outcomes and
are not silently retried or confirmed by an operator. Provider verification is
the only path that confirms funding. Authenticated Paystack events are stored
and processed through the outbox before verification; an event never credits a
wallet by itself.

The detail view keeps canonical USD minor units separate from the provider's
collection amount and displays the immutable conversion snapshot when one
exists. Wallet consequence is read from the credit relation: no credit,
pending credit, and available credit are different durable phases.

The read API is operator-only and requires the `operations:manage` scope for
API-key principals. It exposes safe account, reference, amount, state,
provider-operation, and correlated event metadata. Provider payloads,
authorization access codes, secrets, and manual confirmation/credit controls
are intentionally absent. The historical
`/api/operator/paystack/reconcile` command remains isolated to the legacy
`payment_capability.payments` model and is not a recovery action in this UI.
