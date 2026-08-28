# Purchase and Entitlement Model

[Back to documentation index](./README.md)

> This file retains its historical filename to avoid breaking documentation links. The old campaign/pay-per-action model is superseded by the purchase-and-access model described here.

## Purchase purpose

A purchase records a buyer paying for access to a listing.

The economically meaningful event is a verified purchase, not a page view, CTA click, campaign action, or external destination interaction.

Core sequence:

`listing -> checkout -> payment verification -> purchase -> entitlement -> access`

## Purchase record

A purchase should preserve at least:

- buyer identity;
- seller identity;
- listing identity;
- immutable price snapshot;
- currency and canonical accounting value;
- payment/provider reference;
- referral attribution snapshot where applicable;
- purchase state;
- entitlement relationship;
- idempotency/correlation identifiers;
- timestamps.

Changing a listing later must not rewrite the historical terms of an existing purchase.

## Purchase lifecycle

Use explicit state rather than unrelated booleans.

A practical lifecycle may include:

`pending -> paid -> completed`

with alternative states such as:

`pending -> failed`

and explicit compensated/refunded/reversed states where supported.

The exact names may evolve during implementation, but invalid transitions must be rejected and audited.

## Entitlement

A successful purchase creates or activates an entitlement owned by the buyer for the listing.

Entitlement is the stable authorization concept. It should be able to represent future requirements such as expiration, revocation, limited access, or consumption without forcing Cliqero to know the product type.

V1 should not invent those variants unless required. A normal purchase can simply create an active entitlement.

## Access lifecycle

When the buyer selects `Access`:

1. Cliqero authenticates the buyer where required.
2. Cliqero resolves the relevant entitlement.
3. Cliqero verifies that access is currently authorized.
4. Cliqero creates an access handoff/token.
5. Cliqero redirects to the listing destination with `source=<token>` where applicable.
6. An integrated destination may verify the token through Cliqero's API.
7. Access attempts may be recorded for audit/security without becoming financial events.

## Source token

The `source` value is authorization context, not referral attribution and not merely analytics metadata.

Security requirements:

- do not use raw user IDs, emails, entitlement IDs, or purchase IDs as proof of authorization;
- use an opaque server-side token or a cryptographically signed/verifiable token;
- bind the token to the relevant listing/entitlement/access context;
- support expiry or one-time semantics where the chosen token model requires it;
- make verification idempotent and safe for retries;
- avoid leaking unnecessary buyer personal data to the destination.

## External destination contract

A destination integration asks Cliqero whether a source token is authorized. Cliqero answers the authorization question and may return the minimum context required by that integration.

The destination then decides what to do: serve a file, create a session, expose software, provision an account, reveal an offer, or perform another service-specific action.

Cliqero must not encode those behaviors into the core purchase model.

## Referral consequence

A valid referral attribution becomes financially relevant when a purchase is successfully verified according to platform policy.

A purchase processor may:

1. finalize the purchase;
2. create/activate entitlement;
3. resolve referral attribution;
4. ask the affiliate/referral capability for applicable recipients/shares;
5. request ledger entries for seller, referrer, platform, fees, or other configured recipients;
6. emit purchase/entitlement/commission events.

The referral capability calculates relationship/distribution facts. It does not move money itself.

## Analytics

Useful analytics may include:

- listing views;
- referral visits;
- checkout starts;
- successful purchases;
- conversion rate;
- gross sales;
- referral-attributed sales;
- commissions;
- access attempts;
- successful token verifications where appropriate.

Analytics observes facts and must not become responsible for payment, entitlement, or ledger processing.
