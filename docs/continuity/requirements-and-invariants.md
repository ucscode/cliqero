# Requirements and Invariants

- Keep Cliqero catalogue-led and single-store. Do not reintroduce multi-vendor, Selar, Gumroad, or ordinary-user seller assumptions.
- Keep the API as the authority for business rules; UI is a consumer of API contracts.
- Keep external funding, wallet credit availability, purchase, entitlement, distribution, and treasury as independently retryable boundaries.
- Use canonical USD integer minor units internally. Preserve provider collection currency and immutable conversion facts.
- Providers initialize/verify incoming funding. They do not buy listings, create entitlements, or own ledger/business decisions.
- Wallet deposits are spendable buyer value, not seller/referral earnings and not automatically withdrawable.
- A provider callback/IPN is evidence that schedules verification; only verified matching facts may confirm funding.
- Duplicate callbacks, retries, and workers must not duplicate funding, wallet credits, debits, purchases, entitlements, earnings, or treasury entries.
- Entitlement and access are authorized from current server-side state. Access credentials are opaque random references, not self-contained business claims.
- Referral earnings require qualifying completed commerce. Referral code must not move money directly.
- Keep secrets out of tracked files. Provider configuration is optional and eligibility is configuration-driven.
