# Requirements and Invariants

- Keep Cliqero single-store and API-first. Do not reintroduce an open multi-vendor marketplace, Selar/Gumroad clone, or public seller-onboarding model.
- Selling is privileged, not prohibited: admin and explicitly authorized accounts may list and sell within the single Cliqero store. Authorization must remain capability-controlled.
- Do not misread “single-store” as “platform-only seller economics.” Authorized sellers may have seller economics where commercial policy provides for them; listing authorization and economic attribution must remain explicit rather than inferred.
- Keep the API as the authority for business rules; UI is a consumer of API contracts.
- Keep external funding, wallet credit availability, purchase, entitlement, authorized-seller/referral distribution, and treasury as independently retryable boundaries.
- Use canonical USD integer minor units internally. Preserve provider collection currency and immutable conversion facts.
- Providers initialize/verify incoming funding. They do not buy listings, create entitlements, or own ledger/business decisions.
- Wallet deposits are spendable buyer value, not seller/referral earnings and not automatically withdrawable.
- Authorized-seller earnings, referral earnings, buyer wallet value, and platform treasury must remain distinct accounting concerns.
- A provider callback/IPN is evidence that schedules verification; only verified matching facts may confirm funding.
- Duplicate callbacks, retries, and workers must not duplicate funding, wallet credits, debits, purchases, entitlements, seller/referral earnings, or treasury entries.
- Entitlement and access are authorized from current server-side state. Access credentials are opaque random references, not self-contained business claims.
- Referral earnings require qualifying completed commerce. Referral code must not move money directly.
- Keep secrets out of tracked files. Provider configuration is optional and eligibility is configuration-driven.
