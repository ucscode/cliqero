# Current State

Last audited: 2026-09-10. Branch: `ui`. Implementation audit boundary: `aff81869030b9faab296ee53d01dd9cd3cbfceb7`. Always inspect current HEAD/code before relying on this snapshot.

Cliqero is a single-store, API-first catalogue platform. It is not an open multi-vendor marketplace and is not a Selar/Gumroad-style public seller platform. Catalogue participation is privileged: admin and accounts explicitly granted the appropriate catalogue/selling capability may list and sell within the single Cliqero store. Ordinary unprivileged accounts are buyers and may be promoters.

Single-store does not mean that only the platform can ever have seller economics. Where commercial policy assigns proceeds to an authorized seller, those earnings/settlement facts remain distinct from buyer wallet value, referral earnings, and platform treasury. Listing authorization and economic attribution should be explicit rather than inferred from marketplace assumptions or legacy field names.

The implemented commerce boundary is wallet-first:

`funding -> verified funding -> wallet credit -> available USD wallet -> wallet-only checkout -> purchase -> entitlement/access`

Referral distribution, authorized-seller accounting where applicable, and platform treasury are separate consequences of a paid purchase. Entitlement/access must not wait for distribution, seller settlement, or treasury processing.

Implemented funding surface verified in code during the 2026-09-10 audit:

- `POST /api/wallet/fund` creates an idempotent funding record with canonical USD amount, selected provider, and optional collection currency.
- The commercial worker initializes provider payments, then moves funding to `awaiting_payment`; initialization uses a five-minute reclaimable lease.
- `POST /api/payments/:provider/ipn` accepts signed NOWPayments-family IPNs for `nowpayments`, `usdt_erc20`, and `usdt_trc20`, and queues verification. Paystack uses `POST /api/webhooks/paystack` with `x-paystack-signature` and durable provider-event/outbox handling.
- Verification requires success, matching provider reference, collection amount, and collection currency. Pending statuses return funding to `awaiting_payment`; mismatches fail it; transport/verification errors remain retryable/reconcilable.
- Confirmed funding creates one pending wallet credit; a separate availability processor makes it spendable. Wallet summaries expose available and pending USD projections.
- `POST /api/checkout` accepts only a listing ID and idempotency key. It snapshots a published USD listing, creates an awaiting-funds checkout, and spends available wallet balance only. It never invokes an external provider.

NOWPayments returns a payment address/amount/currency and optional asset/network metadata. Bank transfer returns safe persisted instructions and reports `awaiting_manual_confirmation`; no customer submission alone confirms funding. The operator confirmation path remains incomplete.

The UI funding screen should consume `/api/wallet/funding-methods`, which filters enabled providers by authenticated account country and requested collection currency. It must not duplicate provider eligibility rules.

Some topical documentation from the earlier audit may still use overly strong platform-only/no-seller wording. The invariants in this continuity directory are authoritative product direction; reconcile those topical passages with code and current requirements when touching them rather than reintroducing either open multi-vendor behavior or platform-only selling assumptions.
