# Withdrawals UI

The dashboard Withdrawals panel requests settled earnings from the account's
withdrawable balance. Buyer-wallet funds and company treasury remain separate.

The panel reads the withdrawal policy and owner-scoped withdrawal projection
from `/api/withdrawals/policy` and `/api/withdrawals`, then submits
`POST /api/withdrawals` with exact USD minor units and an idempotency key. The
server reserves available earnings atomically. Completed reservations remain
consumed by the withdrawable projection; released reservations become available
again. User cancellation is offered only while a request is still `requested`
and uses `PATCH /api/withdrawals/:id` with `{ "status": "cancelled" }`.

An approved withdrawal is paid manually outside Cliqero. The operator then
records the already-sent payment, optional external reference, and note through
`PATCH /api/operator/withdrawals/:id`. This updates the withdrawal and completes
its reservation in one transaction. External automation can use the same API;
Cliqero itself does not call an outbound payout provider.

The current user-facing destination remains the provider-neutral manual
destination reference. Saved structured withdrawal destinations are deferred.
