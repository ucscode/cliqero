# Wallet-first commercial workflow

External payment providers fund wallets. Listings are purchased from wallets.

The database is the workflow: each processor discovers authoritative persisted state, commits one transition, and stops. A later failure never invalidates an earlier committed fact.

```text
external funding -> confirmed funding -> pending wallet credit -> available wallet
                                                           |
listing -> checkout awaiting funds -> wallet debit -> paid purchase
                                                   |-> entitlement -> access
                                                   `-> seller/referral/platform distribution
```

Funding records contain provider collection and immutable FX facts but never a listing or purchase identity. A confirmed funding record does not itself change wallet balance. A unique pending credit is created from it, then separately made available.

Funding initialization uses a recoverable database lease. A worker atomically changes `initialization_pending` to `initializing` and records `initialization_claimed_at`; a fresh claim is private to that worker for five minutes. After that interval a fresh worker may reclaim the same funding row. Reclamation retains the funding ID, stable provider reference, idempotency key, canonical amount, collection amount, and conversion snapshot. Provider-operation rows remain append-only evidence of each attempt; they are not the workflow state.

Funding confirmation is an application-level invariant, not an assertion delegated to an adapter. A verification result confirms funding only when it is verified, reports `success`, and exactly matches the persisted provider reference, collection minor amount, and collection currency. A provider success with mismatched facts records rejected operation evidence and moves the funding to terminal `failed`; it is never eligible for wallet credit.

Buyer wallet accounting is append-only, canonical USD, and distinct from earnings accounting. Available wallet credits minus checkout debits determine spendable balance. Seller/referral/platform earnings retain their own pending, settlement, reservation, withdrawal, and reversal rules; wallet deposits are not made withdrawable by this model.

`POST /api/checkout` accepts one listing and creates a durable checkout/purchase snapshot. Insufficient funds produce `awaiting_funds`; no provider is invoked. The checkout processor uses an account-scoped PostgreSQL advisory transaction lock plus a unique debit per checkout to prevent double spending.

Entitlement and distribution are independent consequences of a completed wallet-paid purchase. Entitlements may be non-expiring (`expires_at = null`) or expire at a timestamp. Access checks the timestamp directly, so correctness does not depend on an expiry worker.

The commercial worker isolates both processor families and individual records. Discovery or processing failure is logged with the processor family and durable work ID, then processing continues with healthy records and unrelated capabilities. Durable state remains discoverable on the next iteration; exceptions are not silently discarded.

The canonical buyer entry point is `/access/{purchaseId}`. It authenticates ownership and a current entitlement, then issues the existing opaque random source grant and redirects to the listing destination. Funding provider, FX source, and distribution progress are irrelevant to access.

Historical provider-backed checkout payments remain stored as legacy records. They are not converted into funding and cannot create wallet balance without an authoritative confirmed funding fact.

Legacy provider checkout/completion services remain explicitly named `legacyProviderCheckout` and `legacyPaymentCompletion` in the composition root so historical migrations and provider-payment tests remain inspectable. No public checkout route or commercial worker calls them. Current `/api/checkout` accepts only a listing ID and uses the wallet; Paystack event handling prefers funding records and may only advance a historical payment to verification/reversal processing, never create a new current purchase.
