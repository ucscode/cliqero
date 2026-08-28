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
4. Cliqero creates an access grant and cryptographically random opaque bearer credential.
5. Cliqero redirects to the listing destination with `source=<opaque-token>` where applicable.
6. An integrated destination authenticates itself and may verify the token through Cliqero's Access API.
7. Cliqero resolves the token server-side to the access grant and related entitlement/purchase/listing context.
8. Access attempts may be recorded for audit/security without becoming financial events.

## Source token

The `source` value is an opaque bearer credential/reference. It is authorization context, not referral attribution, analytics metadata, or serialized business data.

Security requirements:

- generate `source` using a cryptographically secure random generator with sufficient entropy;
- do not encode user IDs, emails, entitlement IDs, purchase IDs, listing metadata, JSON claims, or other business data into `source`;
- do not use JWT, JWE, signed/self-contained tokens, or raw UUID/domain identifiers as the authorization model;
- persist a secure hash of the raw bearer credential where practical rather than the recoverable raw token;
- resolve the token server-side to an explicit access grant, which relates to the entitlement and therefore the purchase, listing, buyer, seller, and permitted context;
- bind the access grant to the relevant entitlement/listing/destination or integration scope;
- support future expiry, revocation, rotation, one-time consumption, or scopes through server-side access-grant state when real requirements need them;
- make verification safe for retries;
- avoid leaking unnecessary buyer personal data to the destination.

Possession of `source` alone must not authorize unrestricted use of Cliqero's verification API. Destination integrations authenticate independently.

## External destination contract

A destination integration authenticates to Cliqero and asks whether a `source` credential is authorized within that integration's permitted scope. Cliqero resolves the opaque credential server-side and returns only the minimum authorization context required by that integration.

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
- successful source verifications where appropriate.

Analytics observes facts and must not become responsible for payment, entitlement, or ledger processing.
