# Investor and Business Overview

[Back to documentation index](./README.md)

## Executive summary

Cliqero is a productless commerce and referral platform.

Sellers list access to something using metadata, a price, and a destination. Referrers share attributed listing links. Buyers pay through Cliqero and receive entitlement to access the destination. The underlying thing may be a download, software, a private service, an offer, a course, a repository, a gateway, or another experience that Cliqero does not need to model as a separate product type.

The commercial loop is simple:

> List -> Refer -> Buy -> Access

Cliqero owns the transaction, entitlement, referral economics, and access authorization boundary. The seller or destination system owns the specialized fulfillment experience behind the link.

## Market position

Cliqero sits between several familiar categories:

- digital commerce;
- affiliate/referral marketplaces;
- creator monetization;
- link-based product discovery;
- access/payment gateways;
- lightweight seller storefronts.

Its distinction is not a new product taxonomy. Its distinction is that commerce remains stable regardless of what the destination represents.

## Value proposition for sellers

Sellers can:

- list something without waiting for Cliqero to support its product category;
- provide metadata, price, media, and a destination;
- sell through Cliqero checkout;
- let others refer the listing for commission;
- receive sales earnings;
- use an external destination they already control;
- optionally integrate the destination with Cliqero's entitlement-verification API.

A seller who creates a new private tool, download gateway, SaaS feature, course, or offer elsewhere can monetize it through the same listing model.

## Value proposition for referrers

Referrers receive:

- a marketplace of listings to recommend;
- attributed links;
- earnings tied to valid purchases;
- visibility into attributable sales/earnings where supported;
- withdrawal of eligible earnings.

The referrer does not need to host the product or complete fulfillment.

## Value proposition for buyers

Buyers receive:

- one place to discover and purchase listings;
- a durable purchase record;
- entitlement owned by their Cliqero account;
- a consistent `Access` experience regardless of what exists behind the destination.

For integrated services, Cliqero can also provide authorization context through a secure `source` token that the destination verifies by API.

## Productless economics

The product model deliberately avoids separate ebook/software/course/service architectures.

This reduces both engineering drag and strategic drift. Cliqero only adds structured product-specific data when actual users demonstrate a requirement that generic listing metadata cannot safely represent.

## Referral economics

Referral rewards originate from valid purchases, not page views, CTA clicks, registration fees, or the right to participate.

A sale may be distributed among:

- seller;
- direct referrer/promoter;
- configured account-referral/upline recipients where enabled;
- Cliqero/platform;
- relevant fees according to accounting policy.

The platform remains commercially useful if multi-level referral rewards are disabled.

## Revenue model

Cliqero's base revenue can come from a configurable platform share/fee on successful commerce.

Potential future revenue may include:

- premium seller tools;
- advanced analytics;
- premium referral/distribution tools;
- business API access;
- advanced entitlement/integration features;
- managed services;
- optional subscriptions.

These are extensions, not prerequisites for the core flow.

## Network effects

More useful listings create more inventory for referrers and more reasons for buyers to visit.

More capable referrers increase seller distribution.

More buyers make listing creation more attractive.

Some buyers will become sellers or referrers; some referrers will become sellers. The single-account capability model supports these transitions naturally.

## Initial market

The initial market can begin in Nigeria while the accounting/provider architecture remains globally extensible.

Important local advantages include strong social commerce behavior, widespread link-based selling, creator/referral distribution, and demand for simpler ways to monetize digital or externally hosted value.

## Defensibility

Long-term defensibility can emerge from:

- buyer trust and purchase history;
- seller inventory;
- referral network density;
- payment reliability;
- entitlement/access integrations;
- historical conversion and risk intelligence;
- reusable distribution links;
- APIs and integrations;
- trusted financial operations.

## Expansion

Cliqero does not need a vertical-by-vertical expansion plan at the architecture level.

If users begin selling a new kind of thing, the default response is to represent it with listing metadata and a destination. Only a demonstrated missing invariant justifies a new domain capability.

## Core business test

The strongest test is simple:

> Can a seller put something behind a destination, list it, get paid, let someone refer it, and let a buyer gain authorized access without Cliqero needing to know the product type?

The intended answer is yes.
