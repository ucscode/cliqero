# Cliqero UI foundation

The first user-facing UI is a catalogue-first Next.js experience. The storefront and listing
detail pages consume the public Hono API (`GET /api/listings` and `GET /api/listings/:id`) through a
small browser API client; UI code does not import repositories or application services.

Better Auth remains the only browser authentication mechanism. The header resolves the session and
switches between anonymous discovery and authenticated dashboard navigation. Anonymous visitors see
Buy, while Promote is rendered only for an authenticated account. The Buy action carries an
internal-only continuation path through `/login?next=...`; external URLs are rejected before any
redirect. After authentication, the user returns to the intended wallet-checkout context for the
same listing. The checkout is one persisted listing purchase; it is never replaced by a cart or a
second checkout on retry.

`/dashboard` is an authenticated shell with real wallet and purchase sections. Wallet reads use
`GET /api/wallet` and `GET /api/wallet/transactions`; funding is initiated with
`POST /api/wallet/fund` and observed through `GET /api/wallet/fund/{id}`. The provider's browser
return is never treated as proof: the UI observes persisted funding state, and confirmed funding
then becomes spendable only through the existing wallet-credit and availability workers.

The buyer flow is deliberately stateful:

```text
browse → checkout → awaiting_funds → fund wallet → confirmed funding
       → available wallet credit → same checkout paid → purchase → entitlement → access
```

`GET /api/purchases` exposes purchase and entitlement projections. The UI shows `/access/{purchaseId}`
only when the backend reports a currently usable entitlement; the access route remains the final
authorization boundary. Referral attribution remains attached to checkout through the existing
`/r/{code}` cookie flow and is never attached to wallet funding.

Funding and checkout polling is bounded and visibility-aware. A browser refresh or retry reuses a
stable checkout idempotency key for the listing, while each deliberate new funding attempt gets a
new idempotency key. Pending, empty, unavailable, and entitlement-preparation states are shown
without fabricating balances or purchase success.

Generic presentation primitives now come from `src/components/ui/*`, using Tailwind utilities and
Radix-backed shadcn patterns. The legacy `src/components/ui.tsx` barrel remains only as a temporary
compatibility import for feature screens that have not migrated; new UI should import primitives
directly. Money still uses canonical USD minor units through the `Money` component. Media URLs are
rendered from provider-neutral API URLs and never expose listing destinations.
