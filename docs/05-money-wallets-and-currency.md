# Money, Wallets, and Currency

[Back to documentation index](./README.md)

## Canonical currency

USD is Cliqero's canonical accounting currency.

All financially meaningful internal values should ultimately resolve to USD. Other currencies are presentation conveniences or transaction-entry currencies.

If an offer is canonically priced at `$10`, a Nigerian user may see approximately `₦30,000` today and `₦27,000` tomorrow because the exchange rate changed. The underlying offer price did not change.

If the canonical price changes from `$10` to `$9`, that is a business event that must be deliberate and auditable.

## Display conversion

Currency conversion must not mutate canonical values.

A conversion response should preserve information such as:

- source amount;
- source currency;
- display amount;
- display currency;
- exchange rate;
- rate source;
- quote timestamp;
- quote expiry where relevant.

If the currency capability is unavailable, the system should continue to display canonical USD values rather than fail unrelated pages.

## Money representation

Financial amounts must never use floating-point arithmetic.

Use integer minor units plus currency identity, or an equivalent precise money value object.

Examples:

- USD 10.00 => amount `1000`, currency `USD`;
- NGN 5,000.00 => amount `500000`, currency `NGN`.

Currency precision must come from the money/currency domain rather than arbitrary assumptions in UI code.

## Wallet-first rule

External payments never fund a campaign directly in the domain model.

The universal flow is:

`External payment -> verified funding transaction -> canonical USD value -> wallet ledger -> campaign reservation`

Even if the user interface offers a shortcut such as `Fund this campaign`, the internal process still credits the wallet first and then allocates from wallet balance.

This keeps campaigns independent from payment providers.

## Ledger

The ledger is the financial source of truth.

Balances must not be maintained through arbitrary direct updates such as `UPDATE wallet SET balance = ...`.

Every financial change creates immutable ledger entries.

Examples:

- wallet funding;
- campaign reservation;
- reservation release;
- qualified action distribution;
- promoter earning;
- referral earning;
- platform earning;
- manual adjustment;
- withdrawal reservation;
- payout completion;
- reversal.

A visible wallet balance is derived from ledger state.

## External payment record

When a user funds through a provider, preserve both the provider transaction and canonical accounting value.

A transaction may contain:

- provider name;
- provider reference;
- provider amount;
- provider currency;
- canonical USD amount;
- exchange rate used;
- exchange-rate source;
- rate timestamp;
- verification state;
- idempotency key;
- audit/correlation IDs.

This ensures later investigation can explain exactly how a local-currency payment became a USD wallet credit.

## Initial payment providers

The first production target is Nigeria.

Initial funding capability is expected to include:

- Paystack;
- USDT TRC-20.

Providers are implementations of a generic payment capability. Campaign, wallet, offer, and affiliate code must not import Paystack- or TRON-specific logic.

Additional providers should be addable through provider registration rather than core rewrites.

## Minimum entry amount

Cliqero should allow advertisers to experiment with relatively small funding amounts. An initial Nigerian target is around NGN 5,000.

If a user deposits exactly NGN 5,000, the payment transaction records that amount and the wallet receives the canonical USD equivalent calculated for that transaction.

The user does not need to think in USD even though internal accounting does.

## Campaign reservation

Allocating money to a campaign reserves wallet value.

Example:

- available wallet: $50;
- campaign reserve: $20;
- available balance: $30;
- campaign reserved balance: $20.

Qualified actions consume the campaign reserve.

Closing or reducing the campaign releases unused reservation back into the dashboard wallet.

## Commission distribution

A payable action has a defined action value funded from campaign reservation.

That value is split among economic recipients according to active policy. The base model includes:

- platform share;
- promoter share;
- referral share.

Referral distribution must be calculated by the affiliate/referral capability, but that capability must never move money itself.

A commission processor coordinates the consequence:

1. receive a qualified/distributable action;
2. obtain the promoter recipient;
3. ask the affiliate capability for applicable referral distribution;
4. calculate the platform share;
5. request ledger credits/debits through the wallet/ledger capability;
6. emit distribution-completed events.

## Refunds and reversals

Cliqero distinguishes several concepts.

### Campaign release

Unused reserved campaign money returns to available wallet balance. This is not an external refund.

### Internal reversal

Before promoter/referral commission has been distributed, a rejected payable action may return its reserved amount to the advertiser's dashboard wallet.

### Post-distribution reversal

Once commission has been shared with a promoter/referral recipients, the normal advertiser refund path is no longer available. Exceptional corrections must be represented as compensating ledger entries rather than deleting or rewriting prior financial history.

### External provider refund

Refunding money back through Paystack or another payment provider is a separate capability from campaign reversal. It is not part of the normal V1 campaign flow.

## Withdrawals

Payouts are manual in the initial production release.

A user can request withdrawal of eligible available earnings. A platform operator reviews the request, sends the money manually, records the transfer/reference, and updates the withdrawal state.

Suggested state machine:

`requested -> under_review -> approved -> sent -> completed`

with failure/rejection states as required.

The architecture may later support automated payout providers without changing wallet or withdrawal-domain semantics.

## Financial invariants

The following are non-negotiable:

- every financial mutation is represented in the ledger;
- all financial operations are idempotent;
- canonical USD value is preserved;
- exchange-rate display changes do not mutate canonical balances;
- provider retries must not duplicate funding;
- webhook retries must not duplicate distribution;
- historical financial entries are not deleted;
- campaign modules do not know payment-provider implementations;
- affiliate modules do not credit wallets;
- manual administrative corrections are auditable compensating entries.
