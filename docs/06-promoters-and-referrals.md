# Referrers, Promotion, and Referral Network

[Back to documentation index](./README.md)

## Referrer purpose

Referrers distribute attributed Cliqero listing links and earn when buyers they bring complete valid purchases.

Their economic role is distribution. They do not need to host the product, process the payment, or implement the destination.

## Referrer identity

Referrer/promoter behavior is a capability of a normal Cliqero account.

The same account may also be a seller and buyer.

Referrer identity should remain stable even if individual listings, links, collections, or public handles change.

## Promotion links

Cliqero may support specific listing links, seller-focused links, collections, or versatile public referral pages where useful.

A specific listing referral link is the most important primitive because it can unambiguously preserve attribution to a purchasable listing.

The exact route shape can evolve without changing the attribution model.

## Attribution

Referral/promotion attribution should be owned by a dedicated capability.

It determines facts such as:

- referring account;
- originating link;
- listing/seller context;
- session/click identity;
- attribution window;
- purchase attribution eligibility;
- uniqueness/risk signals.

The attribution layer does not move money and does not grant product access.

## Commission trigger

The economic trigger is a valid purchase.

Conceptually:

`referrer -> visitor -> listing -> purchase -> commission`

A page view, click, checkout start, registration, or destination access does not by itself create commission.

## Account referral graph

Cliqero may also maintain an account-to-account referral graph where an existing user introduced a new Cliqero account.

That relationship is distinct from a listing purchase attribution, even if both can participate in commission policy.

The graph should be able to answer:

- who directly referred this account?
- list direct referrals;
- list uplines/downlines by supported level;
- what level is account A relative to account B?
- which configured recipients apply to a sale distribution?

## Affiliate/referral capability responsibilities

The affiliate/referral module owns relationship and distribution facts.

It may calculate a distribution description such as:

```json
{
  "source_user": "referrer-123",
  "recipients": [{ "user_id": "account-78", "level": 1, "share": "..." }]
}
```

It must not:

- credit or debit wallets;
- finalize purchases;
- verify payments;
- grant or revoke entitlements;
- process withdrawals;
- own payment-provider integrations.

A purchase/commission processor consumes its result and requests money movement through the ledger capability.

## Reward source

Referral rewards must originate from genuine platform commerce, not registration fees or the right to participate.

Cliqero must remain useful as a listing, purchase, and access platform even if multi-level account referral rewards are disabled.

## Distribution policy

Commission percentages, referral eligibility, levels, maximum depth, pending periods, and other economic rules should be policy/configuration rather than hard-coded into the relationship graph.

The base architecture should support simple direct refer-and-earn without requiring a complex network plan.

## Earnings lifecycle

Referral earnings should use explicit state, for example:

`pending -> available -> withdrawal_reserved -> paid`

with rejected/reversed/compensated states where necessary.

The UI should distinguish pending earnings from withdrawable balance.

## Productless boundary

Referral logic must never branch on whether a listing represents an ebook, software, course, service, offer, or another product category.

It cares about listing identity, attribution, purchase validity, and configured commission policy. Nothing more.
