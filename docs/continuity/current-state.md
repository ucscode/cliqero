# Current State

Last audited: 2026-09-10. Branch: `ui`. Audit commit: `aff81869030b9faab296ee53d01dd9cd3cbfceb7`.

Cliqero is a single-store, API-first catalogue platform. The platform owns the commercial catalogue; `catalogue.manage`/`system.root` controls listing administration. Ordinary accounts are buyers and may be promoters. `created_by` and legacy seller fields are audit/compatibility data, not ordinary-user seller economics.

The implemented commerce boundary is wallet-first:

`funding -> verified funding -> wallet credit -> available USD wallet -> wallet-only checkout -> purchase -> entitlement/access`

Referral distribution and platform treasury are separate consequences of a paid purchase. Entitlement/access does not wait for distribution or treasury processing.

Implemented funding surface verified in code:

- `POST /api/wallet/fund` creates an idempotent funding record with canonical USD amount, selected provider, and optional collection currency.
- The commercial worker initializes provider payments, then moves funding to `awaiting_payment`; initialization uses a five-minute reclaimable lease.
- `POST /api/payments/:provider/ipn` accepts signed NOWPayments-family IPNs for `nowpayments`, `usdt_erc20`, and `usdt_trc20`, and queues verification. Paystack uses `POST /api/webhooks/paystack` with `x-paystack-signature` and durable provider-event/outbox handling.
- Verification requires success, matching provider reference, collection amount, and collection currency. Pending statuses return funding to `awaiting_payment`; mismatches fail it; transport/verification errors remain retryable/reconcilable.
- Confirmed funding creates one pending wallet credit; a separate availability processor makes it spendable. Wallet summaries expose available and pending USD projections.
- `POST /api/checkout` accepts only a listing ID and idempotency key. It snapshots a published USD listing, creates an awaiting-funds checkout, and spends available wallet balance only. It never invokes an external provider.

NOWPayments returns a payment address/amount/currency and optional asset/network metadata. Bank transfer returns safe persisted instructions and always reports `awaiting_manual_confirmation`; no customer submission alone confirms funding. The operator confirmation path remains incomplete.

The UI funding screen should consume `/api/wallet/funding-methods`, which filters enabled providers by authenticated account country and requested collection currency. It must not duplicate provider eligibility rules.
