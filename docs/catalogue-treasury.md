# Catalogue, commission, and treasury

Cliqero is a platform catalogue, not a multi-seller marketplace. Ordinary accounts may browse, fund a USD wallet, purchase listings, promote referral links, and withdraw referral earnings. Catalogue managers and operators manage listing content through the operator listing APIs; `created_by` metadata is audit information and is not a seller/payee relationship.

## Listing lifecycle

Listings transition explicitly through `draft → published → archived`; restore returns an archived listing to draft. Only published listings are public. Operator catalogue APIs are capability-protected, and delete means archive.

## Commission policy

New wallet-paid purchase distributions read `config/hierarchy/distribution.yaml`. The YAML shape is:

```yaml
distribution:
  commission:
    levels:
      1: 50
      2: 30
      3: 10
```

Values are whole percentages, levels must be contiguous from 1, and their total cannot exceed 100. An explicitly present `levels: {}` disables referral commissions and assigns the complete gross to the platform; a missing runtime file is invalid and never falls back to this example. Missing uplines are not redistributed; their allocation remains the platform remainder. Every distribution stores an immutable snapshot of the applied levels and economic policy, while the associated immutable referral ledger entries remain the authoritative recipient/amount records. The old database policy remains only for historical provider-backed records and is not consulted for new wallet purchases.

## Money and treasury

All platform accounting is canonical USD minor units (`$10.00 = 1000`). Referral allocations are exact bigint-cent calculations. New distributions create referral earnings and a platform allocation; they do not create seller earnings. A treasury worker independently turns each platform allocation into one append-only treasury credit. Operators correct mistakes by appending another ordinary credit or debit with an explanatory title and note; there is no separate treasury reversal business concept.

Wallet, user earnings, and treasury balances are projections over their own immutable facts. They are separate account classes: wallet deposits are spendable for purchases but are not seller earnings or automatically withdrawable. Treasury processing can fail or restart without invalidating a completed purchase, entitlement, distribution, or referral earnings.

Treasury operator APIs are `GET /api/operator/treasury`, `GET /api/operator/treasury/entries`, `GET /api/operator/treasury/entries/:id`, `POST /api/operator/treasury/entries`, and the compatibility `POST /api/operator/treasury/expenses` debit shortcut. Treasury entries are immutable facts; no update/delete API exists. Manual entries normally have no `source_kind` or `source_id`; those fields remain reserved for deterministic machine-originated relationships such as a distribution's platform allocation. Distribution configuration is mandatory at `config/hierarchy/distribution.yaml`; `levels: {}` and `levels: null` deliberately disable referral commissions, while an incomplete structure is invalid.
