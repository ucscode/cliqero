# Listings, Profiles, and Access Links

[Back to documentation index](./README.md)

## Public surfaces

Cliqero separates public discovery from authenticated management.

The main domain owns the application/dashboard. Public distribution may use dedicated subdomains or routes, but those surfaces are presentation and attribution concerns rather than separate product architectures.

## Seller public profile

A seller may have a public profile containing:

- display name;
- logo/avatar;
- description;
- visible listings;
- optional public metadata.

Profiles are conveniences around listings, not owners of product-specific behavior.

## Listings

A Listing is the generic object representing something that can be purchased for access.

Cliqero intentionally does not define separate listing types for ebook, software, course, API, service, template, download, offer, or similar categories.

A listing should contain stable fields such as:

- identity;
- owner/seller;
- title;
- description;
- price;
- media;
- destination URL;
- status/visibility;
- timestamps;
- extensible metadata.

Additional structured fields should be introduced only when actual product requirements establish a domain invariant that metadata cannot safely represent.

## Destination

Every purchasable listing resolves to a destination.

The destination may point to:

- a private download gateway;
- Google Drive or another storage surface;
- Supabase-backed access flow;
- a SaaS application;
- a repository or code-delivery service;
- an offer page;
- a custom application created by the seller;
- any future URL-based access surface.

Cliqero does not infer product type from the URL and does not need to know what happens after authorized access is handed off.

## Buyer access URL

A raw destination should not necessarily be exposed as the only form of access. The buyer should normally open the listing through a Cliqero access route so the platform can validate entitlement and create an auditable handoff.

Conceptually:

`buyer -> Cliqero access endpoint -> entitlement check -> destination?source=<token>`

The `source` token must be opaque or cryptographically protected. It must not rely on a raw account ID, email, purchase ID, or another query value that an attacker can forge.

## Destination verification

An integrated destination may call Cliqero's API with the received token to determine whether access is authorized.

Conceptual request:

```http
POST /api/access/verify
Content-Type: application/json

{"token":"<source-token>"}
```

Conceptual response:

```json
{
  "authorized": true,
  "listing_id": "...",
  "entitlement_id": "...",
  "expires_at": "...",
  "metadata": {}
}
```

The exact public contract can evolve during implementation, but the security property must remain: possession of easily guessed listing or buyer identifiers is not authorization.

A destination that does not integrate with Cliqero may simply ignore the `source` parameter. This must not force every listing into a custom integration.

## Organic versus referral URLs

Organic listing URLs carry no referral attribution.

Referral/promoter URLs carry enough attribution context for Cliqero to associate a later valid purchase with the referrer according to policy.

Referral attribution belongs to Cliqero. It should not require the destination system to understand promoter identities or commission logic.

## Durable public links

Human-readable slugs should be preferred where practical, but internal identity must remain stable if a title or slug changes.

A specific listing link should remain semantically tied to that listing. It must not silently redirect to an unrelated listing simply to keep a referral URL economically active.

## Dashboard location

Authenticated management belongs on the main application surface:

- account settings;
- seller profile editing;
- listing management;
- purchases;
- buyer entitlements/access history;
- referral links and earnings;
- wallet/ledger views where applicable;
- withdrawals;
- administration.
