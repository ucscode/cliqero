# Referrers, Promotion, and Referral Network

[Back to documentation index](../README.md)

## Referrer purpose

Referrers share attributed catalogue URLs and earn when buyers they bring complete valid purchases.

Their economic role is distribution. They do not need to host the product, process the payment, or implement the destination.

## Referrer identity

Referrer/promoter behavior is a capability of a normal Cliqero account.

The same account may also be a seller and buyer.

Referrer identity should remain stable even if individual listings, links, collections, or public usernames change.

## Promotion links

Each published listing can be shared with a deterministic URL containing the
immutable referrer-account UUID and listing UUID (`/r/{referrer}/{listing}`).
The URL is derived at request time; it has no generated code or persisted link
record and remains valid when a username changes.

Account invitations use a separate deterministic URL, `/r/{referrer}`. A valid
account or product referral click creates a short-lived, opaque account-referrer
attribution for the browser; only a completed new-account registration may
consume it into `account_referrals`. The attribution is replaced and its
30-day lifetime restarts on every valid referral click. Registration after
expiry is parentless, and an existing account's parent is never changed by a
later referral click.

## Attribution

Referral/promotion attribution should be owned by a dedicated capability.

It determines facts such as:

- referring account;
- originating listing URL;
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

Account referral attribution and listing purchase attribution are separate
facts. A product referral refreshes both: the generic account attribution is
used only during registration, while the listing attribution remains scoped to
that listing and is resolved later by purchase processing.

Customer referral views are split by purpose. **Hierarchy** is the bounded
graphical exploration of an authorized account tree. **Referrals** is the
paginated descendant listing, with selectable existing level and each
account's immediate upline and direct-child count. The listing uses a complete
server-side recursive traversal and is not derived from the graph's
per-branch visualization limit.

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

For purchase distribution, the buyer is Level 0 and cannot receive commission. Level N is the buyer's Nth persisted account upline, regardless of any listing promoter recorded by a product referral click. The configured platform percentage and explicit positive level percentages are reserved first; level keys may be sparse and their YAML order has no economic meaning. A configured level without an actual upline is allocated to the platform, while the seller receives the remaining configured share. Listing attribution remains a separate immutable purchase fact for promotion history and does not redefine hierarchy commission.

The base architecture should support simple direct refer-and-earn without requiring a complex network plan.

## Earnings lifecycle

Referral earnings should use explicit state, for example:

`pending -> available -> withdrawal_reserved -> paid`

with rejected/reversed/compensated states where necessary.

The UI should distinguish pending earnings from withdrawable balance.

## Productless boundary

Referral logic must never branch on whether a listing represents an ebook, software, course, service, offer, or another product category.

It cares about listing identity, attribution, purchase validity, and configured commission policy. Nothing more.
