# Catalogue, commission, and treasury

Cliqero is a platform catalogue, not a multi-seller marketplace. Ordinary accounts may browse, fund a USD wallet, purchase listings, share deterministic referral URLs, and withdraw eligible earnings. Accounts with `catalogue.manage` manage listing content through the operator listing APIs; `created_by` metadata is audit information and is not a seller/payee relationship.

## Listing lifecycle

Listings transition explicitly through `draft → published → archived`; restore returns an archived listing to draft. Only published listings are public. Operator catalogue APIs are capability-protected, and delete means archive.

## Commission policy

New wallet-paid purchase distributions read `config/hierarchy/distribution.yaml`. The YAML shape is:

```yaml
distribution:
  platform:
    percentage: 10
  commission:
    levels:
      1: 50
      2: 30
      3: 10
```

The platform percentage and each level are whole percentages. The buyer is Level 0; Level N is the buyer's Nth upline. Level keys are positive integers, may be sparse, and are independent of YAML order. The platform percentage plus all explicitly configured levels cannot exceed 100. An explicitly present `levels: {}` or `levels: null` disables referral allocations; the seller receives the remaining amount after the platform share and configured level allocations. A configured level without a real upline goes to the platform, while only actual uplines receive referral ledger entries. A missing runtime file is invalid and never falls back to this example. Every distribution stores an immutable snapshot of the applied levels and economic policy, while the associated immutable ledger entries remain the authoritative recipient/amount records. The old database policy remains only for historical provider-backed records and is not consulted for new wallet purchases.

## Money and treasury

All platform accounting is canonical USD minor units (`$10.00 = 1000`). Seller and referral allocations are exact bigint-cent calculations. New distributions create a seller proceeds entry, actual hierarchy commission entries, and a platform allocation. A treasury worker independently turns each platform allocation into one append-only treasury credit. Operators correct mistakes by appending another ordinary credit or debit with an explanatory title and note; there is no separate treasury reversal business concept.

Wallet, user earnings, and treasury balances are projections over their own immutable facts. They are separate account classes: wallet deposits are spendable for purchases but are not seller earnings or automatically withdrawable. Treasury processing can fail or restart without invalidating a completed purchase, entitlement, distribution, or referral earnings.

Treasury operator APIs are `GET /api/operator/treasury`, `GET /api/operator/treasury/entries`, `GET /api/operator/treasury/entries/:id`, `POST /api/operator/treasury/entries`, and the compatibility `POST /api/operator/treasury/expenses` debit shortcut. Treasury entries are immutable facts; no update/delete API exists. Manual entries normally have no `source_kind` or `source_id`; those fields remain reserved for deterministic machine-originated relationships such as a distribution's platform allocation. Distribution configuration is mandatory at `config/hierarchy/distribution.yaml`; `platform.percentage` is required, while `levels: {}` and `levels: null` deliberately disable referral commissions. The current `createCatalogue()` path still records its manager as the required listing `seller_id` for schema compatibility; this task documents that mismatch but does not change catalogue ownership semantics.
