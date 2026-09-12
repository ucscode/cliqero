# Active Work and Proof Gaps

## Next continuation point

Repairs #1–#3 and the internal funding-integrity pass are implemented in the current working tree: direct TRC20 confirmation handling, bank-transfer customer evidence, canonical funding navigation, currency semantics, precision, idempotency, bounded polling messaging, minimum-unit formatting, active-funding coexistence, funding history, cancellation, and development-provider isolation. Provider acceptance is intentionally paused; do not create a funding or payment record until this pause is lifted. Preserve provider eligibility in the backend.

The next implementation session should begin by inspecting current code/tests and this continuity directory. Keep continuity documentation updated whenever substantial requirements, flow behavior, architectural decisions, milestones, blockers, or acceptance evidence change.

## Known proof gaps

- Genuine NOWPayments sandbox connectivity and key acceptance are proven, but a successful create-payment/IPN/confirmation run is still pending because the `$1.00` test amount was below the provider's dynamic minimum for `usdttrc20`.
- Paystack TEST initialization, browser checkout, API verification, wallet credit, and availability are proven for funding `9d8d7de9-9283-4af6-9174-f34138704eeb`. The old authorization used `/wallet` because it was created before the private YAML callback correction; current main/worker runtime loading resolves `/payments/paystack/callback`. A genuine signed Paystack webhook delivery is still unproven. Direct TRC20 external acceptance remains outstanding.
- Bank-transfer confirmation is finance-capability protected and audited transactionally. Real manual bank reconciliation still needs an operational procedure/customer support workflow; the API intentionally does not let customers confirm transfers.
- The repository contains legacy provider-backed checkout/payment compatibility code and historical schema names. Current wallet checkout does not call it; remove or archive only after compatibility consumers are confirmed.
- The earlier documentation audit overcorrected the product model in places by treating “single-store/not multi-vendor” as “ordinary-user seller economics are impossible.” Correct direction: selling is restricted to admin/explicitly authorized accounts inside one Cliqero store. Do not regress into either public multi-vendor behavior or a platform-only-selling assumption.
- The documented integration recipe supplies local `APP_URL`, database, media, and blog paths. The full integration run currently has one unrelated outbox-worker idempotent-consumer failure; it must be diagnosed before treating the suite as clean.
- The 2026-09-12 default Vitest command ran 309 non-integration tests successfully, but its 15 integration suites could not initialize because the test process lacked `APP_URL`; this is an environment bootstrap gap, not a product assertion failure.
- The local PostgreSQL environment has applied `database/migrations/002_funding_cancellation.sql`; fresh or older environments must run the repository migration before the new `cancelled` state can be written.
- The wallet UI regression was caused by the local Next.js hot-reload process retaining the pre-refactor global container, whose active-funding repository method returned one object while the current API expected an array. Restarting the web container restored the current contract; the API now also safely normalizes legacy/malformed active results, and balance/activity reads have independent UI error boundaries.

## Backend funding acceptance milestone

Before considering funding ready for UI/production use, distinguish mocked proof from genuine provider proof:

- exercise the privileged bank-transfer confirmation/reconciliation path against a persisted funding record;
- configure at least one real receiving account in the ignored local bank-transfer YAML and verify per-account eligibility/instruction persistence;
- exercise Paystack TEST webhook delivery through the existing persisted acceptance record or a separately approved future record; do not create another payment solely to repeat the already-proven initialization/API-verification path;
- exercise NOWPayments sandbox/test through a persisted Cliqero funding transaction when credentials/environment are available;
- NOWPayments sandbox acceptance uses the official create-payment `case: success` test procedure via the optional `sandbox_case: success` setting. The adapter never sends this field to the live API; `pay_currency: usdttrc20` remains the current sandbox test currency, and the IPN callback must be publicly reachable. Sandbox cases do not involve real funds.
- NOWPayments minimum handling is provider-aware: `/v1/min-amount` is queried for the selected pair with a USD fiat equivalent, and below-minimum funding is blocked before `POST /v1/payment` with a customer-safe retry message. The minimum is dynamic and must be rechecked during initialization.
- configure and exercise direct-wallet `usdt_trc20` with a real receiving address and verifier credentials; NOWPayments handles the remaining supported crypto methods;
- prove confirmed funding creates wallet credit exactly once and availability remains a separate processor;
- prove funding success does not manufacture purchase, entitlement, seller/referral distribution, or treasury consequences.

If an external checkout requires manual browser/customer action, stop at persisted authorization/payment instructions and continue from the same funding transaction afterward. Never create an orphan provider transaction by bypassing Cliqero persistence.

## UI continuation after backend proof

The funding UI should consume backend eligibility and funding contracts rather than hardcoding provider/country policy:

`GET /api/wallet/funding-methods -> select eligible method -> POST /api/wallet/fund -> render persisted provider instructions/authorization -> observe funding status`

Do not collapse asynchronous provider initialization/verification into the UI merely to make redirects easier.

The current provider UX contract keeps bank preparation limited to account selection and the quote; persisted status shows the immutable account snapshot, provider display name, generic funding reference, and explicit bank narration instruction. Shared exchange rates are PostgreSQL-backed and fresh for 24 hours by default; only the exact persisted rate is used for conversion, while the UI renders a two-decimal rate without the internal source. Paystack hosted continuation uses same-tab navigation. NOWPayments minimum diagnostics carry minor units so `1915` USD is rendered as `$19.15`, including legacy rows matching the known structured diagnostic format.

Payment providers are modular funding modules. The generic funding entry at `/dashboard/wallet/fund` selects canonical amount/provider only and does not create funding or initialize a provider. Provider preparation uses `/dashboard/wallet/fund/{provider}?amount=...`; explicit provider-page Proceed then enters the normal persisted funding workflow. `/dashboard/wallet/fund?funding={id}` remains the canonical resumable status/payment URL. Awaiting payments may continue with their persisted provider authorization, while initialization and verification states show progress without creating another provider transaction. Paystack browser callbacks redirect to this status view using `APP_URL`; `0.0.0.0` remains only a server bind address. Genuine signed Paystack webhook delivery remains unproven.

Internal integrity audit result: funding `a3290266-b85d-42cb-b2d9-15c59a94ef53` explains the reported `$2,000.00` increase as a real prior NOWPayments acceptance record with one normal credit/availability chain; no accounting defect or Development-provider involvement was found. The `1915 USD` message was a minor-unit formatting leak and now displays `$19.15`. The current NOWPayments IPN route still lacks funding provider-event persistence, and external NOWPayments IPN/confirmation plus genuine Paystack webhook delivery remain unproven.

## Verification ledger

The 2026-09-10 documentation audit/reorganization changed documentation only. It did not re-run the application test suite because no product code changed. A prior implementation report stated focused payment tests, the non-integration suite, typecheck, lint, formatting, and diff checks passed, but future work must re-run checks relevant to its current code rather than treating historical counts as current evidence.

## Wallet funding UI and bank-transfer contract

The dedicated funding route and persisted `?funding=` route are separate modes. The latter renders only the saved funding status and provider-specific next action; it never renders the generic funding form. Initialization states show indeterminate progress and manual refresh. The overview shows a bounded active-payment summary and the full active list is available at `/dashboard/wallet/funding?active=true`.

Bank-transfer eligibility derives from the authenticated account country. All eligible configured receiving accounts are returned to the provider preparation page; the customer selects the account, the account supplies collection currency, and the selected account ID, opaque field snapshot, and instructions are persisted with the funding. There is no first-match account selection.

Migration `002_funding_cancellation.sql` is applied in the local PostgreSQL environment so the runtime funding state union and `funding_state_valid` constraint both accept `cancelled`. Cancellation preserves the funding row and creates no wallet credit.
