# Withdrawals UI

The dashboard Withdrawals panel requests payouts from the user's available
earnings ledger. Buyer-wallet funds and company treasury are separate domains.

The panel reads the withdrawal policy and owner-scoped withdrawal projection
from `/api/withdrawals/policy` and `/api/withdrawals`, then submits
`POST /api/withdrawals` with exact USD minor units and an idempotency key.
The server reserves available earnings atomically. Completed reservations remain
consumed by the withdrawable projection; released reservations become available
again. User cancellation is offered only while a request is still `requested`.

Payout execution is asynchronous and remains the responsibility of the existing
operator/worker/provider flow. The UI observes persisted states (`requested`,
`approved`, `completed`, `rejected`, `cancelled`, and `failed`) and never calls a
payout provider directly. The current user-facing destination is the existing
provider-neutral manual destination reference; no provider credentials are
shown.
