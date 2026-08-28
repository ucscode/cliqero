# Offers, Profiles, and Public Links

[Back to documentation index](./README.md)

## Public surfaces

Cliqero separates public traffic from authenticated management.

The main domain is the application/dashboard. Public distribution uses dedicated subdomains:

- `s.<domain>` — advertiser showcase/public offer surface;
- `a.<domain>` — promoter-attributed public surface;
- `r.<domain>` — referral attribution surface.

The subdomains are public distribution surfaces, not separate dashboards.

All authenticated management stays on the main domain.

## Advertiser public profile

An advertiser has a public profile such as:

`https://s.example.com/@glamhair`

The profile may show:

- display name;
- logo/avatar;
- description;
- currently visible offers;
- social/contact destinations;
- optional public metadata.

The public profile is useful organically even when the advertiser has no active paid campaign.

## Offers

An Offer is the generic object an advertiser wants people to discover or act on.

The term is intentionally broader than Product. An offer may represent:

- a physical product;
- a service;
- a song;
- a property;
- an event;
- a restaurant;
- an app;
- a course;
- a creator/channel;
- any other promotable destination.

A canonical offer URL may look like:

`https://s.example.com/@glamhair/bone-straight`

Human-readable slugs should be preferred over exposing internal database IDs in public URLs where practical.

## Reusable advertiser destinations

An advertiser should not need to re-enter the same WhatsApp number or Instagram account for every offer.

The account can maintain reusable destinations such as:

- WhatsApp;
- phone;
- website;
- Instagram;
- Facebook;
- TikTok;
- Telegram;
- YouTube;
- other supported destinations.

An offer can then select one or more of these existing destinations as its CTA.

## Offer-specific destination overrides

Saved advertiser destinations are defaults, not restrictions.

Any individual offer can define a custom destination when that offer needs to behave differently from the advertiser's shared profile channels.

Examples:

- the advertiser's main WhatsApp is saved globally, but one offer should open a dedicated campaign WhatsApp line;
- the advertiser's normal website is saved globally, but a property offer should open a specific property page;
- the advertiser usually sends users to Instagram, but an event offer should open a ticket page;
- an offer should use a custom label such as `Book Appointment` with a custom URL.

An offer-specific override must not modify the advertiser's saved global channel.

## Organic URLs versus promoter URLs

Organic advertiser URLs carry no promoter attribution.

Example:

`https://s.example.com/@glamhair/bone-straight`

A visitor may browse and click CTAs, but no promoter reward is released because no promoter brought that session.

Promoter-attributed URLs use `a.<domain>`.

Possible structures include:

- `https://a.example.com/<promoter>` — versatile promoter/discovery page;
- `https://a.example.com/<promoter>/<collection>` — category/topic collection;
- `https://a.example.com/<promoter>/<advertiser>` — advertiser-focused promotion;
- `https://a.example.com/<promoter>/<advertiser>/<offer>` — specific offer promotion.

The exact routing implementation can evolve while preserving the conceptual distinction between organic and attributed traffic.

## Referral URLs

Referral links are not promotion links.

A referral URL such as:

`https://r.example.com/<refCode>`

attributes a future Cliqero account to the referrer.

The referred account may later become an advertiser, promoter, or both.

## Dashboard location

The main domain owns authenticated management:

- account settings;
- advertiser profile editing;
- offer management;
- campaign management;
- wallet funding;
- promoter marketplace;
- promoter links/collections;
- earnings;
- referrals;
- withdrawals;
- administration.

The public subdomains should stay focused on distribution, attribution, and public presentation.
