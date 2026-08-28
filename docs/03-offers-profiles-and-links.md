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

A raw destination should not normally be the authorization mechanism. The buyer should open the listing through a Cliqero access route so the platform can validate entitlement and create an auditable handoff.

Conceptually:

`buyer -> Cliqero access endpoint -> entitlement check -> destination?source=<opaque-token>`

`source` is a cryptographically random opaque bearer token. It is not a JWT/JWE payload and contains no buyer, listing, purchase, entitlement, price, email, or other business data that a recipient can decode.

The token exists only as an unguessable reference to server-side access state owned by Cliqero.

Cliqero resolves that reference to the relevant relationship graph, for example:

`source token -> access grant -> entitlement -> purchase -> listing -> buyer/seller`

The exact internal relationships may evolve, but the external rule must not: the token itself carries no authoritative business data.

## Token storage and comparison

Access tokens must be generated with a cryptographically secure random generator with sufficient entropy for bearer credentials.

Where practical, persist only a secure hash of the token rather than the raw bearer value. Verification hashes the presented token and compares it to the stored token record. A database disclosure should therefore not automatically expose usable access credentials.

Token records may contain explicit state and policy information such as active/revoked state, creation time, last-used time, expiration, consumption limits, or rotation ancestry when those requirements exist.

Do not introduce expiry, one-time consumption, or similar policies until the product requires them, but the access model must allow them without changing the public `source` contract.

## Destination verification API

An integrated destination may send the received `source` value to Cliqero's Access API to determine whether access is currently authorized.

Conceptual request:

```http
POST /api/access/verify
Authorization: Bearer <integration-credential>
Content-Type: application/json

{"source":"<opaque-source-token>"}
```

The verification endpoint itself must authenticate and authorize the destination/integration. Possession of a `source` token must not grant arbitrary access to Cliqero's verification or data APIs.

Conceptual response:

```json
{
  "authorized": true,
  "listing_id": "...",
  "entitlement_id": "...",
  "metadata": {}
}
```

The API should expose only the minimum information that the authenticated integration needs. It may resolve richer internal relationships without returning them.

The API response is authoritative at verification time. Because `source` contains no self-contained claims, revocation, entitlement changes, refunds, and future access policy changes can take effect centrally without invalidating a token format.

A destination that does not integrate with Cliqero may simply ignore the `source` parameter when its own access model does not require verification. This must not force every listing into a custom integration.

## API-first access capability

The access model should be API-powered even when Cliqero's own web application is the first consumer.

The web UI, external destinations, and future SDK/library integrations should depend on the same access capability contract rather than duplicating entitlement logic.

A future official SDK may wrap token verification and API calls for external applications, but it must remain a client of the Access API rather than becoming a second source of authorization truth.

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
