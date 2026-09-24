# Withdrawals UI

The dashboard Withdrawals panel requests settled earnings from the account's
withdrawable balance. Buyer-wallet funds and company treasury remain separate.

Withdrawal methods are configured form definitions; saved withdrawal
destinations are account-owned reusable values for those definitions; each
withdrawal stores an immutable snapshot of the selected destination. The
dedicated Withdrawal methods section lists, adds, edits, and archives saved
destinations. Archived destinations are retained and cannot be selected for new
requests.

The panel reads policy, earnings, and saved destinations, then submits
`POST /api/withdrawals` with `amount_minor`, `currency`, and the owned
`destination_id`, plus an idempotency key. It never accepts free-form payment
details. The server validates method availability and snapshots ordered field
labels, values, types, and copy metadata before reserving available earnings
atomically. Customer withdrawal history exposes only method/name identity, not
bank or wallet fields. Completed reservations remain consumed by the
withdrawable projection; released reservations become available again. User
cancellation is offered only while a request is still `requested` and uses
`PATCH /api/withdrawals/:id` with `{ "status": "cancelled" }`.

An approved withdrawal is paid manually outside Cliqero. The operator then
records the already-sent payment, optional external reference, and note through
`PATCH /api/operator/withdrawals/:id`. This updates the withdrawal and completes
its reservation in one transaction. External automation can use the same API;
Cliqero itself does not call an outbound payout provider.

`GET /api/withdrawal-methods` returns enabled methods eligible for the
authenticated account country. `GET/POST /api/withdrawal-destinations` and
`GET/PATCH /api/withdrawal-destinations/:id` manage only that account's saved
destinations. A PATCH with `{ "status": "archived" }` is the supported Remove
operation; there is no archive command URL or hard-delete UI.

Withdrawal YAML lives in `config/modules/withdrawal/methods.yaml`; the tracked
`methods.example.yaml` documents the supported schema. It uses the shared
`parameters` envelope and can optionally import relative YAML fragments through
the generic configuration loader. Top-level method country filters decide
eligibility only; they do not execute or select a payout provider.
For local use, copy the example to `config/modules/withdrawal/methods.yaml` and
edit the methods for the development account countries.

Cliqero remains manual-first. An operator or external automation reads an
approved withdrawal's structured snapshot, sends payment outside Cliqero, then
PATCHes the withdrawal as completed. Editing or archiving a saved destination
never changes a historical withdrawal snapshot.

This development-baseline schema change replaces the temporary free-form
destination columns. Existing local development databases must be reset and
bootstrapped from `database/migrations/001_initial_schema.sql` before running
the updated feature; no incremental migration is added.
