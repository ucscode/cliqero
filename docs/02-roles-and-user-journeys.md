# Roles and User Journeys

[Back to documentation index](./README.md)

Cliqero uses one canonical account identity with capability-based authorization. Ordinary accounts are not sellers.

## Visitor

A visitor can browse the public catalogue and inspect listing details without authentication. A visitor may arrive organically or through an attributed referral link. Authentication is required when an account-specific action needs durable identity.

## Buyer / member

An ordinary authenticated account can:

- browse the catalogue;
- purchase listings;
- view purchases;
- reopen valid access;
- inspect buyer funding/account value where appropriate;
- promote eligible listings;
- view referral network/earnings where applicable;
- request withdrawal of eligible earnings;
- manage profile, integrations, settings, and API keys where authorized.

An ordinary account cannot create, publish, import, or administratively manage commercial listings.

## Promoter / referrer

Promotion is a capability of an ordinary authenticated account, not a separate economic identity. Eligible users can obtain attributed listing links and share them. Qualifying purchases may create earnings according to platform policy.

Clicks, views, registrations, and recruitment alone do not create commission.

Promotion is intentionally presented through dedicated referral/opportunity surfaces. It should not dominate the general storefront's customer proposition.

## Catalogue manager

`catalogue_manager` is a privileged capability. It permits the catalogue-management subset of operator functionality, including creation/editing, media management, publication/archive/restore, and supported import/export.

A catalogue manager is not a seller and does not become a payee merely because they created or managed a listing.

## Administrator / operator

Operators manage the wider platform: catalogue, users/capabilities, financial operations, provider operations, distributions, withdrawals/payouts, treasury, referral/network inspection, failures/retries, and audit/operational visibility.

Administrative corrections preserve history through explicit auditable facts rather than deleting financial truth.

## Typical buyer journey

1. Discover a listing.
2. Review its presentation and price.
3. Sign in/register when identity is required.
4. Create a single-listing checkout.
5. If sufficient internal value is available, checkout records the purchase payment internally.
6. If funds are insufficient, the checkout can await funding while the user funds separately through a supported incoming provider.
7. A paid purchase creates entitlement/access consequences independently from referral distribution.
8. The buyer opens `/access/{purchaseId}`.
9. Cliqero verifies ownership and active/unexpired entitlement and redirects to the destination, optionally with an opaque `source` credential.

## Typical promoter journey

1. Register/sign in.
2. Open the dedicated promotion/referral area.
3. Choose an eligible catalogue listing.
4. Obtain an attributed link.
5. Share the link.
6. A visitor follows it and later completes a qualifying purchase.
7. Valid attribution is snapshotted with the purchase/distribution facts.
8. Earnings enter the earnings ledger, mature according to policy, and become withdrawable when eligible.

## Typical catalogue-management journey

1. An operator grants the appropriate capability.
2. The catalogue manager creates/imports a draft listing.
3. They add presentation metadata, price, destination, and media.
4. They publish the listing.
5. Customers discover and purchase it.
6. The manager may later edit presentation, archive, restore, or manage media without rewriting historical purchase facts.

## Identity principle

Better Auth proves authentication. Cliqero's canonical account ID remains the domain/economic identity, and capabilities/scopes determine what that account may do. Browser sessions and API keys converge on the same application authorization model.
