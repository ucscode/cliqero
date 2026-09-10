# Active Work and Proof Gaps

## Next continuation point

Backend funding operations now include an explicit operator bank-transfer confirmation path. The next product task is wallet/payment UI integration using `GET /api/wallet/funding-methods` and the funding create/status contracts. Preserve provider eligibility in the backend.

The next implementation session should begin by inspecting current code/tests and this continuity directory. Keep continuity documentation updated whenever substantial requirements, flow behavior, architectural decisions, milestones, blockers, or acceptance evidence change.

## Known proof gaps

- No genuine Paystack or NOWPayments sandbox transaction was performed in the 2026-09-10 audit; test credentials/funded environments were not available.
- Bank-transfer confirmation is finance-capability protected and audited transactionally. Real manual bank reconciliation still needs an operational procedure/customer support workflow; the API intentionally does not let customers confirm transfers.
- The repository contains legacy provider-backed checkout/payment compatibility code and historical schema names. Current wallet checkout does not call it; remove or archive only after compatibility consumers are confirmed.
- The earlier documentation audit overcorrected the product model in places by treating “single-store/not multi-vendor” as “ordinary-user seller economics are impossible.” Correct direction: selling is restricted to admin/explicitly authorized accounts inside one Cliqero store. Do not regress into either public multi-vendor behavior or a platform-only-selling assumption.

## Backend funding acceptance milestone

Before considering funding ready for UI/production use, distinguish mocked proof from genuine provider proof:

- exercise the privileged bank-transfer confirmation/reconciliation path against a persisted funding record;
- configure at least one real receiving account in the ignored local bank-transfer YAML and verify per-account eligibility/instruction persistence;
- exercise Paystack TEST through a persisted Cliqero funding transaction when credentials/environment are available;
- exercise NOWPayments sandbox/test through a persisted Cliqero funding transaction when credentials/environment are available;
- NOWPayments sandbox acceptance uses the official create-payment `case: success` test procedure via the optional `sandbox_case: success` setting. The adapter never sends this field to the live API; `pay_currency: usdttrc20` remains the current sandbox test currency, and the IPN callback must be publicly reachable. Sandbox cases do not involve real funds.
- configure and exercise direct-wallet `usdt_trc20` with a real receiving address and verifier credentials; NOWPayments handles the remaining supported crypto methods;
- prove confirmed funding creates wallet credit exactly once and availability remains a separate processor;
- prove funding success does not manufacture purchase, entitlement, seller/referral distribution, or treasury consequences.

If an external checkout requires manual browser/customer action, stop at persisted authorization/payment instructions and continue from the same funding transaction afterward. Never create an orphan provider transaction by bypassing Cliqero persistence.

## UI continuation after backend proof

The funding UI should consume backend eligibility and funding contracts rather than hardcoding provider/country policy:

`GET /api/wallet/funding-methods -> select eligible method -> POST /api/wallet/fund -> render persisted provider instructions/authorization -> observe funding status`

Do not collapse asynchronous provider initialization/verification into the UI merely to make redirects easier.

## Verification ledger

The 2026-09-10 documentation audit/reorganization changed documentation only. It did not re-run the application test suite because no product code changed. A prior implementation report stated focused payment tests, the non-integration suite, typecheck, lint, formatting, and diff checks passed, but future work must re-run checks relevant to its current code rather than treating historical counts as current evidence.
