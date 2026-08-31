# Cliqero UI foundation

The first user-facing UI is a catalogue-first Next.js experience. The storefront and listing
detail pages consume the public Hono API (`GET /api/listings` and `GET /api/listings/:id`) through a
small browser API client; UI code does not import repositories or application services.

Better Auth remains the only browser authentication mechanism. The header resolves the session and
switches between anonymous discovery and authenticated dashboard navigation. Anonymous visitors see
Buy, while Promote is rendered only for an authenticated account. The Buy action carries an
internal-only continuation path through `/login?next=...`; external URLs are rejected before any
redirect. After authentication, the user returns to the intended listing context and can continue
to the wallet checkout API.

`/dashboard` is an authenticated shell for the upcoming capability screens. It deliberately avoids
invented balances or activity and links to the future wallet, purchases, referral, earnings and
withdrawal sections. The next UI milestone can add those screens as API clients without changing
the routing or authentication boundary.

The shared presentation layer lives in `src/components/ui.tsx` and uses canonical USD minor units
for display through the `Money` component. Media URLs are rendered from the provider-neutral URLs
returned by the API and never expose listing destinations.
