# Roles and User Journeys

[Back to documentation index](./README.md)

## Identity model

Cliqero uses one account identity. Seller, referrer/promoter, and buyer behavior are capabilities of the same account rather than separate user systems.

A single account may sell listings, refer listings, buy listings, or do any combination of those things.

The referral relationship belongs to the account itself and must not require a separate identity model.

## Seller

A seller is an account that creates listings for something people can pay to access.

The seller can:

- maintain public profile information where supported;
- create and manage listings;
- set listing title, description, price, media, metadata, destination, and visibility/state;
- configure referral eligibility and commission policy where platform policy permits;
- view purchases, sales, referral-attributed sales, earnings, and relevant analytics;
- change a listing destination without changing the meaning of past financial records.

The seller is not required to upload the underlying product to Cliqero. The destination may point to any supported external or internal access surface.

## Referrer / promoter

A referrer distributes attributed Cliqero listing links.

The referrer can:

- browse eligible listings;
- generate or obtain attributed listing links;
- share those links through social media, communities, messaging platforms, websites, video descriptions, or other channels;
- view attributed visits and purchases where exposed;
- view pending and available referral earnings;
- request withdrawal when eligible.

A referrer earns from a valid attributed purchase according to the applicable commission policy. Clicks and page views alone do not create commission.

## Buyer

A buyer discovers a listing, pays through Cliqero, receives a purchase record and entitlement, and can then access the configured destination.

A buyer account should be able to view previously purchased listings and re-open access while the entitlement remains valid.

The buyer does not need to care whether the destination is a file download, application, course, private gateway, offer, or another kind of service.

## Visitor

A visitor may browse public listings without being entitled to them.

A visitor may arrive organically or through a referral link. Referral attribution can be preserved through checkout according to platform policy.

A visitor becomes a buyer when a purchase is successfully completed and the corresponding entitlement is created.

## Administrator/operator

Administrative responsibilities include:

- moderating prohibited or abusive listings;
- reviewing suspicious purchases/referrals;
- enabling or disabling providers and runtime capabilities;
- reviewing withdrawal requests;
- recording manual payout completion where applicable;
- inspecting audit trails, payment records, entitlements, and ledger entries;
- revoking or compensating access/financial state through explicit auditable operations rather than deleting history.

## Typical seller journey

1. Register or sign in.
2. Create a listing.
3. Add the metadata necessary to explain what the buyer receives.
4. Set the price.
5. Configure the destination URL.
6. Publish the listing.
7. Optionally allow referral promotion according to platform policy.
8. Buyers discover and purchase the listing.
9. Successful purchases create entitlements.
10. The seller reviews sales and earnings.

## Typical referrer journey

1. Register or sign in.
2. Browse listings eligible for referral.
3. Obtain an attributed listing link.
4. Share it.
5. A visitor follows the link and completes a valid purchase.
6. The purchase retains valid referral attribution.
7. Commission is calculated and recorded through the financial processor/ledger.
8. Earnings become withdrawable according to policy.

## Typical buyer journey

1. Discover a listing organically or through a referral link.
2. Review listing metadata and price.
3. Sign in or register when required for purchase/entitlement ownership.
4. Pay through a supported payment provider.
5. Cliqero verifies the payment idempotently.
6. Cliqero records the purchase and creates the entitlement.
7. The buyer chooses `Access`.
8. Cliqero creates an access handoff and redirects to the listing destination, optionally appending `?source=<token>`.
9. An integrated destination may verify the token with Cliqero before granting its own access.

## Access is a platform concept; fulfillment is not

Cliqero determines whether the buyer is entitled to access a listing. It does not need to implement the destination's internal fulfillment.

The same buyer journey must remain valid whether the destination returns a download, opens software, provides an offer, provisions a service, or does something else entirely.
