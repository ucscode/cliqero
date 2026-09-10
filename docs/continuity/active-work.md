# Active Work and Proof Gaps

## Next continuation point

Finish and prove backend funding operations before UI integration. Then make the UI consume `GET /api/wallet/funding-methods` and the funding create/status contracts. Preserve provider eligibility in the backend.

The next implementation session should begin by inspecting current code/tests and this continuity directory. Keep continuity documentation updated whenever substantial requirements, flow behavior, architectural decisions, milestones, blockers, or acceptance evidence change.

## Known proof gaps

- No genuine Paystack or NOWPayments sandbox transaction was performed in the 2026-09-10 audit; test credentials/funded environments were not available.
- Bank transfer has initialization and pending semantics, but still needs a privileged operator confirmation/reconciliation workflow before it can confirm funding.
- The repository contains legacy provider-backed checkout/payment compatibility code and historical schema names. Current wallet checkout does not call it; remove or archive only after compatibility consumers are confirmed.
- The earlier documentation audit overcorrected the product model in places by treating “single-store/not multi-vendor” as “ordinary-user seller economics are impossible.” Correct direction: selling is restricted to admin/explicitly authorized accounts inside one Cliqero store. Do not regress into either public multi-vendor behavior or a platform-only-selling assumption.

## Backend funding acceptance milestone

Before considering funding ready for UI/production use, distinguish mocked proof from genuine provider proof:

- finish the legitimate privileged bank-transfer confirmation/reconciliation path;
- exercise Paystack TEST through a persisted Cliqero funding transaction when credentials/environment are available;
- exercise NOWPayments sandbox/test through a persisted Cliqero funding transaction when credentials/environment are available;
- verify `usdt_erc20` and `usdt_trc20` remain distinct methods with correct asset/network/payment-instruction metadata;
- prove confirmed funding creates wallet credit exactly once and availability remains a separate processor;
- prove funding success does not manufacture purchase, entitlement, seller/referral distribution, or treasury consequences.

If an external checkout requires manual browser/customer action, stop at persisted authorization/payment instructions and continue from the same funding transaction afterward. Never create an orphan provider transaction by bypassing Cliqero persistence.

## UI continuation after backend proof

The funding UI should consume backend eligibility and funding contracts rather than hardcoding provider/country policy:

`GET /api/wallet/funding-methods -> select eligible method -> POST /api/wallet/fund -> render persisted provider instructions/authorization -> observe funding status`

Do not collapse asynchronous provider initialization/verification into the UI merely to make redirects easier.

## Verification ledger

The 2026-09-10 documentation audit/reorganization changed documentation only. It did not re-run the application test suite because no product code changed. A prior implementation report stated focused payment tests, the non-integration suite, typecheck, lint, formatting, and diff checks passed, but future work must re-run checks relevant to its current code rather than treating historical counts as current evidence.
