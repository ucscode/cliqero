# Operator distributions and earnings

The operator Distributions and Earnings pages are read-only inspection surfaces. They follow the current wallet-first flow: an available buyer wallet pays for a purchase, the purchase is distributed once, qualifying referral commissions are appended to the earnings ledger, and pending entries become available only through the settlement processor.

Distribution records retain the immutable applied commission-policy snapshot and the purchase's referral attribution. The UI reports only actual beneficiary ledger entries. A configured level without a qualifying upline is not an unpaid commission; its amount remains in the persisted platform remainder. Integer USD minor-unit amounts and any cent residue are authoritative.

Earnings are separate from the buyer wallet. Pending, available, and reversed states are projections over append-only ledger facts. Operator reads never settle, reverse, credit, debit, or otherwise mutate financial records. Historical attribution and distribution facts do not change when the referral graph is reassigned later.

Operator APIs require an operator principal and `operations:manage` for API-key callers. Catalogue managers and ordinary accounts cannot inspect these routes. Withdrawals, treasury consequences, and operational workers remain separate milestones.
