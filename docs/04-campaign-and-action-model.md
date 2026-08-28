# Campaign and Action Model

[Back to documentation index](./README.md)

## Campaign purpose

A campaign puts money behind an existing offer.

An advertiser may have a public profile and offers without paying anything. Payment begins only when the advertiser funds a campaign and chooses the action that should consume campaign budget.

## Campaign setup

A campaign should define at least:

- advertiser;
- offer;
- campaign status;
- allocated budget;
- payable action type;
- action value;
- targeting or eligibility rules where supported;
- start/end controls where supported.

The advertiser funds the wallet first. Campaign money is then reserved from wallet balance.

## Free visibility, paid action

A promoted visitor may:

1. open a promoter link;
2. view the offer;
3. browse other offer details;
4. leave.

No campaign charge is created from those steps alone.

The campaign becomes economically relevant when the visitor triggers the configured action.

Examples:

- click WhatsApp;
- click Call Now;
- open a website;
- open Instagram;
- open Telegram;
- open a custom destination;
- another future action provider supported by Cliqero.

## Action lifecycle

A payable action should be explicit state rather than a boolean.

Suggested lifecycle:

`observed -> pending -> qualified -> distributed`

Alternative outcomes:

`pending -> rejected`

A previously qualified action may require an administrative compensating reversal in exceptional circumstances, but financial history must never be deleted.

## Qualification

The visitor clicking a CTA does not automatically mean the action must be paid without validation.

The attribution/fraud layer may consider:

- session integrity;
- duplicate behavior;
- device/browser signals;
- IP/rate patterns;
- data-center/proxy characteristics;
- campaign targeting;
- repeated CTA activity;
- suspicious promoter patterns;
- other risk signals.

The precise anti-fraud formula should not be publicly exposed.

## Campaign budget as reserved money

Campaign allocation should be modeled as reserved wallet value rather than money disappearing immediately.

Example:

- wallet available: $100;
- campaign allocation: $40;
- wallet available after reservation: $60;
- campaign reserved: $40.

Each qualified payable action consumes from reserved campaign value.

If the advertiser pauses or closes the campaign with unused allocation, the unused amount is released back to available wallet balance.

That release is not an external payment refund.

## Campaign state machine

A robust campaign should use explicit states such as:

`draft -> funded -> active -> paused -> exhausted -> closed`

State transitions must be auditable and validated.

## What the advertiser is buying

Cliqero should describe campaign value truthfully.

A CTA click does not guarantee a sale or completed conversation. Therefore the platform should say:

> Pay when someone takes the action you selected.

It should not claim:

> Pay only for customers.

unless a future campaign type is actually tied to a verified conversion.

## Future action strengths

The architecture should allow stronger future actions without changing the base model:

- CTA click;
- verified lead;
- signup;
- external conversion callback;
- app install;
- purchase confirmation;
- advertiser-defined webhook conversion.

Each is simply another action capability with its own qualification rules.

## Campaign analytics

Campaign analytics may expose:

- impressions;
- public page views;
- attributed sessions;
- CTA actions;
- qualified actions;
- rejected actions;
- action rate;
- spend;
- reserved budget;
- remaining budget;
- outbound destination breakdown.

Analytics must observe facts and must not become responsible for financial processing.
