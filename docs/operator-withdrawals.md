# Operator withdrawals and payouts

The operator Withdrawal surface is an inspection and workflow console for user
earnings withdrawals. It does not edit amounts, wallets, earnings, or
reservations.

## Lifecycle

Available earnings are reserved when a user requests a withdrawal. An operator
may approve or reject the request. Approval does not pay or release funds.
Payout execution is performed by `PayoutExecutionProcessor` using one stable
execution per withdrawal and append-only attempts. A verified successful payout
completes the withdrawal and its reservation exactly once. Rejection and user
cancellation release a reservation exactly once.

Automated `submitted`, `unknown`, and `pending` outcomes are treated as
potentially transferred funds: the withdrawal remains approved and reserved,
and the operator must reconcile the existing provider reference. They are never
blindly resubmitted. Retryable failures follow the persisted backoff time.

Manual completion, where supported, means an operator confirms that an external
manual transfer has already happened. It cannot race with or follow an automated
payout attempt.

The operator APIs are Hono-owned and require an operator principal plus the
`withdrawals:manage` API-key scope. Catalogue managers and ordinary accounts
cannot inspect or mutate operator withdrawals. Destination references and
provider metadata are masked to safe projections; provider credentials are
never exposed.
