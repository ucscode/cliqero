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

Buyer wallet accounting is append-only, canonical USD, and distinct from earnings accounting. Available wallet credits minus checkout debits determine spendable balance. Seller/referral/platform earnings retain their own pending, settlement, reservation, withdrawal, and reversal rules; wallet deposits are not made withdrawable by this model.

`POST /api/checkout` accepts one listing and creates a durable checkout/purchase snapshot. Insufficient funds produce `awaiting_funds`; no provider is invoked. The checkout processor uses an account-scoped PostgreSQL advisory transaction lock plus a unique debit per checkout to prevent double spending.

Entitlement and distribution are independent consequences of a completed wallet-paid purchase. Entitlements may be non-expiring (`expires_at = null`) or expire at a timestamp. Access checks the timestamp directly, so correctness does not depend on an expiry worker.

The canonical buyer entry point is `/access/{purchaseId}`. It authenticates ownership and a current entitlement, then issues the existing opaque random source grant and redirects to the listing destination. Funding provider, FX source, and distribution progress are irrelevant to access.

Historical provider-backed checkout payments remain stored as legacy records. They are not converted into funding and cannot create wallet balance without an authoritative confirmed funding fact.
