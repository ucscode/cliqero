# Operator withdrawals

Withdrawals move available seller proceeds or referral earnings through a reviewable
manual payment workflow. Cliqero records the request and reservation; it does
not send outbound funds.

## Lifecycle

1. The account requests a withdrawal. Cliqero reserves the requested amount
   from available earnings in the same transaction.
2. An operator reviews the request and either approves or rejects it. Rejection
   releases the reservation.
3. After approval, the operator sends the money outside Cliqero. An automation
   may do that external work on the operator's behalf.
4. Once the money has been sent, the operator or automation PATCHes the same
   withdrawal resource to `completed`, optionally including an external
   reference and note. Cliqero records the actor and completion time, completes
   the reservation, and appends `withdrawal.completed` atomically.

The completion PATCH records a payment that has already happened. It never
starts a transfer. Duplicate completion is rejected by the withdrawal state
transition, so the reserved funds cannot be consumed twice. Account owners may
cancel only a still-requested withdrawal; cancellation releases the
reservation.

## Destination snapshot

An account selects one of its active saved destinations when requesting a
withdrawal. A destination is created from a configured withdrawal method, and
the withdrawal stores a snapshot of the method identity/display name, saved
destination name, and ordered structured fields. Later edits, archival, or
configuration changes do not rewrite this snapshot.

Configured fields use `name` as their submitted value identity. Editable field
types include `text`, `select`, and `textarea`; `fixed` fields are
server-injected. Regex and enum rules are enforced server-side. Select options
are ordered key/value entries: the key is the submitted machine value and the
value is the human-facing label. Simple metadata such as `copyable` and
`placeholder` stays directly on the field. Additional HTML-oriented settings
may live under `attributes`; reserved semantic/control properties and event
attributes are filtered so they cannot override the configured field.

Operator list results stay concise. Authorized operator detail returns the full
snapshot (`name`, `label`, `value`, optional `displayValue`, `type`,
`copyable`) so a human or automation can perform the manual payment without
scraping display text. Ordinary customer withdrawal history does not expose the
field values. Destination records are archived rather than hard-deleted through
the customer UI.

## API access

The operator API is resource-based:

- `GET /api/operator/withdrawals`
- `GET /api/operator/withdrawals/{withdrawalId}`
- `PATCH /api/operator/withdrawals/{withdrawalId}`

The PATCH accepts approval, rejection with a reason, or completion with an
optional `external_reference` and `note`. It requires the
`withdrawals.manage` capability. API-key clients also need the
`withdrawals:manage` scope.

Cliqero business actions are API-operable; that does not mean Cliqero internally
automates the external payment. Operators can handle the workflow in the UI,
while an external automation such as n8n can read a withdrawal detail, send
funds through its own integration, and record completion through the same API.
Both update the same Withdrawal resource. Operator APIs require the
`withdrawals.manage` capability and API keys additionally require the
`withdrawals:manage` scope.
