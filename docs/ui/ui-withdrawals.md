# Withdrawals UI

The dashboard Withdrawals panel requests settled earnings from the account's
withdrawable balance. Buyer-wallet funds and company treasury remain separate.

Ledger available earnings are the settled balance recorded by ledger state.
Withdrawable earnings are the amount currently available for a new withdrawal
after reservation accounting. Customer-facing “Available earnings” and “Ready
for withdrawal” use the withdrawable amount; raw ledger balances remain
available separately for accounting views.

Withdrawal methods are configured form definitions; saved withdrawal
destinations are account-owned reusable values for those definitions; each
withdrawal stores an immutable snapshot of the selected destination. The
The account-facing Payout Methods section lists and archives saved withdrawal
destinations. “Payout method” is user-facing terminology for a saved withdrawal
destination. A Withdrawal Method remains the configured technical definition;
a Withdrawal Destination remains the persisted domain/API resource. Customers
add payout methods at `/dashboard/payout-methods/new` and edit them at
`/dashboard/payout-methods/{destinationId}/edit`; both pages use the same
method-driven form, and the configured method is fixed when editing. Archived
destinations are retained and cannot be selected for new requests.

Method fields use `name` as their value identity and may be `text`, `select`,
`textarea`, server-owned `fixed`, or server-owned `hidden`. Optional field
`description` text appears as help beneath customer-editable controls and
visible fixed values. Fixed values appear read-only; hidden values are omitted
from customer forms and saved-method lists. Both are injected by the server,
persisted in the destination snapshot, and available to authorized operator
detail/API consumers. Client submissions cannot set either value. Text and
textarea values may be constrained by server-enforced `regex` and `enum`
rules. Select options are ordered `{ key, label }` entries, where the key is
submitted and the label is human-facing.

The create form groups the method type and its description first, then the
saved-method name, then the configured payout details. Field `copyable`
metadata is retained for operator/automation use, not used to add copy actions
to the customer-facing saved-method list.

Editable fields may define an `attrs` mapping for HTML control attributes such
as `placeholder`, `rows`, `autocomplete`, `maxlength`, `aria-*`, or
`data-*`. Cliqero-owned properties such as `name`, `type`, `required`,
`value`, `id`, `list`, and `pattern` are filtered out of `attrs`, as
are event-style `on*` attributes, so attrs cannot override field identity or
validation behavior. HTML attribute spelling is used in YAML; the React
renderer translates names such as `autocomplete` and `maxlength`
internally. The browser mirrors `regex` through the HTML `pattern` attribute
for early feedback, but the server remains authoritative.

The required deployment policy is loaded from
`config/modules/withdrawal/policy.yaml` through the shared YAML configuration
loader. It declares `enabled`, an uppercase three-letter `currency`, a positive
integer `minimum_amount_minor`, and a positive integer or `null`
`maximum_amount_minor`; monetary limits are integer minor units (for example,
USD 100 means $1.00), and a configured maximum cannot be below the minimum.
There is no PostgreSQL withdrawal-policy table or database fallback. Missing or
invalid policy configuration prevents withdrawal operations from silently
using an invented default.

The panel reads policy, earnings, and saved destinations, then submits
`POST /api/withdrawals` with `amount_minor`, `currency`, and the owned
`destination_id`, plus an idempotency key. The customer form asks only for the
amount and payout method; it has no free-form withdrawal note. It never accepts
free-form payment details. The server validates method availability and
snapshots ordered field labels, values, types, and copy metadata before
reserving available earnings atomically. Customer withdrawal history exposes
only method/name identity, not bank or wallet fields. Completed reservations
remain consumed by the withdrawable projection; released reservations become
available again. User cancellation is offered only while a request is still
`requested` and uses `PATCH /api/withdrawals/:id` with
`{ "status": "cancelled" }`.

The Withdrawals dashboard displays only the five most recent requests as a
preview. “View full history” opens `/dashboard/withdrawals/history`. That page
uses account-scoped server-side keyset pagination (`limit` and opaque
`next_cursor` on `GET /api/withdrawals`); each page contains at most 25
withdrawals, ordered newest-first by creation time and stable database ID.
Previous-page navigation reuses the cursor trail rather than loading the whole
history into the browser.

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
`methods.example.yaml` documents the supported schema and includes comments
for non-obvious settings. It uses the shared `parameters` envelope and can
optionally import relative YAML fragments through the generic configuration
loader. Top-level method country filters decide eligibility only; they do not
execute or select a payout provider. For local use, copy the example to
`config/modules/withdrawal/methods.yaml` and edit the methods for the
development account countries. Withdrawal method definitions do not support
`image_url`; method identity is presented through its configured display name
and description.

Cliqero remains manual-first. An operator or external automation reads an
approved withdrawal's structured snapshot, sends payment outside Cliqero, then
PATCHes the withdrawal as completed. Editing or archiving a saved destination
never changes a historical withdrawal snapshot.

This development-baseline schema change replaces the temporary free-form
destination columns. Existing local development databases must be reset and
bootstrapped from `database/migrations/001_initial_schema.sql` before running
the updated feature; no incremental migration is added.
