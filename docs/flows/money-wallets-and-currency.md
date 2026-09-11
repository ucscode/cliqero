# Money, Wallets, and Currency

[Back to documentation index](../README.md)

## Canonical currency

USD is Cliqero's canonical accounting currency.

Listings may be displayed or paid in convenient supported currencies, but financially meaningful internal values must preserve a canonical accounting value and the original transaction context.

Currency conversion must never silently mutate historical listing purchases or ledger entries.

## Money representation

Financial amounts must never use floating-point arithmetic.

Use integer minor units plus currency identity, or an equivalent precise Money value object.

Examples:

- USD 10.00 => amount `1000`, currency `USD`;
- NGN 5,000.00 => amount `500000`, currency `NGN`.

## Wallet-first money flow

The current financial flow is split into independent boundaries:

`funding creation -> provider initialization -> provider callback/IPN or polling -> verification -> wallet credit -> available wallet`

`available wallet -> wallet-only checkout -> purchase -> entitlement`

`paid purchase -> referral/platform distribution`

External providers fund internal buyer wallet value; they do not purchase listings or create entitlements directly. See [Wallet-first commercial workflow](./wallet-first-commerce.md) for the state transitions and retry boundaries.

No module should bypass these boundaries by directly changing balances.

## Ledger

The ledger is the financial source of truth.

Balances must not be maintained through arbitrary direct balance updates.

Every financial consequence creates immutable ledger entries, for example:

- buyer payment settlement/accounting entry;
- seller earning;
- referrer/promoter commission;
- referral/upline commission where enabled;
- platform earning;
- provider fee;
- manual adjustment;
- withdrawal reservation;
- payout completion;
- refund/reversal/compensating entry.

Visible balances are derived from ledger state.

## External payment record

A payment record should preserve enough information to reconstruct what happened:

- provider name;
- provider reference;
- provider amount;
- provider currency;
- canonical USD amount;
- exchange rate used where applicable;
- exchange-rate source/timestamp where applicable;
- verification state;
- purchase reference;
- idempotency key;
- audit/correlation IDs.

Provider retries must not create duplicate purchases, entitlements, commissions, or credits.

## Initial payment providers

The code currently registers Paystack, NOWPayments-managed crypto, direct-wallet `usdt_trc20`, and `bank_transfer` when their configuration is enabled. Provider eligibility is filtered by account country and requested collection currency; the API exposes eligible methods rather than requiring the UI to hardcode policy. Direct TRC20 funding snapshots the receiving wallet, network, asset, and expected amount, then verifies a customer-submitted transaction hash against configured blockchain infrastructure.

For acceptance testing, NOWPayments Sandbox supports its official create-payment `case: success` procedure through `sandbox_case: success`. The field is sent only to the sandbox API (never live), with `usdttrc20` as the current test currency; IPN testing requires a publicly reachable callback and uses no real funds.

Providers implement a generic payment capability. Listing, purchase, entitlement, referral, and ledger code must not import Paystack- or TRON-specific logic.

Bank transfer is configured as one `bank_transfer` method containing independent receiving accounts. Each account has its own explicit country/currency filters and ordered opaque display fields; Cliqero does not validate or attach semantics to banking-specific field keys. Initialization selects an eligible account and persists the account identifier and rendered instructions with the funding record; existing funding does not depend on later mutable configuration.

Additional providers should be addable through provider registration rather than core rewrites.

## Sale distribution

A successful purchase has a gross sale value. Distribution policy determines how that value is allocated.

Possible recipients include:

- seller;
- direct referrer/promoter;
- applicable referral/upline recipients;
- Cliqero/platform;
- payment/provider fees where represented internally.

The affiliate/referral capability determines relationship/distribution facts but never writes ledger entries itself.

A commission/sale processor coordinates the consequence through the ledger capability.

## Catalogue and distribution accounting

New wallet-paid catalogue purchases create referral earnings and a platform allocation according to the configured distribution policy. They do not create ordinary-user seller earnings. Buyer wallet value, referral earnings, and platform treasury are separate accounting domains.

## Referral earnings

Referral commission exists only because a valid attributed purchase occurred.

Clicks, account registration, destination access, or page views do not directly create referral earnings.

Referral percentages and levels should remain runtime policy/configuration rather than hard-coded assumptions.

## Refunds and reversals

Historical financial entries must never be deleted or rewritten.

If refunds are supported, they must be modeled as explicit financial/domain operations with compensating ledger consequences.

Entitlement consequences must also be explicit. For example, a successfully refunded purchase may revoke access according to policy rather than silently deleting the entitlement.

Automatic external refunds do not need to be part of V1 unless required.

## Withdrawals

Payouts may be manual in the initial production release.

A user can request withdrawal of eligible available earnings. An operator reviews the request, sends the money manually, records the transfer/reference, and updates the withdrawal state.

Suggested lifecycle:

`requested -> under_review -> approved -> sent -> completed`

with rejection/failure states as required.

## Financial invariants

The following are non-negotiable:

- every financial mutation is represented in the ledger;
- all financially meaningful operations are idempotent;
- canonical value and original provider transaction context are preserved;
- provider/webhook retries do not duplicate purchases or distributions;
- historical financial records are not deleted;
- payment providers do not own purchase business logic;
- affiliate/referral modules do not move money;
- listing changes do not mutate historical purchase snapshots;
- manual administrative corrections use auditable compensating entries.

# Wallet funding currencies

Wallet funding keeps the collection currency (the fiat amount used for
accounting, currently USD for the NOWPayments sandbox) separate from the
payment currency selected at the provider. The funding-methods API returns the
eligible providers and any provider-backed currency choices; the browser must
not invent either list.

NOWPayments uses `config.pay_currencies` as its server-side allowlist and
`config.pay_currency` as the default. The selected currency is persisted with
the funding initialization facts and is used during verification. The sandbox
may use `sandbox_case: success`; the `case` field is sent only to the
NOWPayments sandbox host. Direct `usdt_trc20` remains the custom direct-wallet
method and is separate from NOWPayments. The authenticated funding-methods
response uses `collection_currencies` (always an array), while funding status
may expose the persisted provider payment instructions. Wallet funding is a
dedicated `/dashboard/wallet/fund` page; its optional `return` path is accepted
only when it is an internal continuation such as the preserved checkout.
