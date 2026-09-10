# Active Work and Proof Gaps

## Next continuation point

Finish and prove backend funding operations before UI integration. Then make the UI consume `GET /api/wallet/funding-methods` and the funding create/status contracts. Preserve provider eligibility in the backend.

## Known proof gaps

- No genuine Paystack or NOWPayments sandbox transaction was performed in this audit; test credentials/funded environments were not available.
- Bank transfer has initialization and pending semantics, but still needs a privileged operator confirmation/reconciliation workflow before it can confirm funding.
- The repository contains legacy provider-backed checkout/payment compatibility code and historical schema names. Current wallet checkout does not call it; remove or archive only after compatibility consumers are confirmed.
- Product intent says authorized-role users can list and sell, while the current code/docs audit establishes catalogue ownership and no ordinary-user seller-credit branch. Treat the broader seller wording as an unresolved product decision, not an implementation fact.

## Verification ledger

This audit changed documentation only. It did not re-run the application test suite because no product code changed. Future implementation work should revalidate focused payment tests, the full non-integration suite, typecheck, lint, formatting, and integration behavior as appropriate rather than trusting historical counts from chat.
