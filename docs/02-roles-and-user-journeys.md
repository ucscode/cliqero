# Roles and User Journeys

[Back to documentation index](./README.md)

## Identity model

Cliqero uses one account identity. Roles are capabilities attached to the same account rather than separate user systems.

A single account may act as:

- advertiser;
- promoter;
- referrer;
- any combination of the above.

The referral relationship belongs to the account itself, not to a role. If Alice refers Bob and Bob later becomes both an advertiser and a promoter, Bob remains Alice's referred account.

## Advertiser

An advertiser is an account that wants people to discover and act on one or more offers.

The advertiser can:

- maintain a public profile;
- save reusable social/contact channels;
- create offers;
- choose which saved destination an offer should use;
- override a saved destination with an offer-specific custom destination;
- fund the wallet through supported payment providers;
- allocate wallet funds to campaigns;
- choose the payable action and its value;
- start, pause, resume, and close campaigns;
- view impressions, visits, attributed sessions, payable actions, spend, and remaining campaign budget.

The advertiser does not pay Cliqero for a visitor merely seeing an offer.

## Promoter

A promoter is an account that distributes advertiser offers through attributed Cliqero links.

The promoter can:

- browse eligible campaigns;
- select individual offers to promote;
- share links to an advertiser profile or specific offer;
- maintain a versatile promoter/discovery page;
- maintain topic-specific collections where supported;
- view attributed visits and qualified actions;
- view pending and available earnings;
- request manual withdrawal when eligible.

A promoter does not need to sell the advertiser's product. The promoter earns when a visitor attributed to them completes the campaign's payable action and that action is qualified.

## Referrer

A referrer introduces another account to Cliqero through a platform referral link.

Referral is distinct from promotion.

- Promotion attribution answers: who brought this visitor to this advertiser offer?
- Referral attribution answers: who introduced this account to Cliqero?

The referral graph can be queried for direct referrals, levels, uplines, and downlines. The affiliate/referral module does not move money itself. It only returns relationship and distribution information that another processor may use.

## Visitor

A visitor does not need a Cliqero account to view a public advertiser page or promoted offer.

A visitor may:

- land on an advertiser's public profile;
- land on a specific offer;
- arrive through an attributed promoter link;
- view one or several offers;
- activate a CTA such as WhatsApp, Call, Website, Instagram, Telegram, or a custom destination.

When the visit is attributed to a promoter, a qualified CTA action can release campaign value according to the configured distribution rules.

## Administrator/operator

An administrator operates the platform rather than participating in campaign economics.

Administrative responsibilities include:

- moderating prohibited or abusive offers;
- reviewing suspicious actions;
- enabling or disabling providers and runtime features;
- reviewing withdrawal requests;
- manually sending approved withdrawals in the initial release;
- recording payout references and completion state;
- inspecting audit trails and ledger entries;
- resolving exceptional operational disputes without deleting financial history.

## Typical advertiser journey

1. Register or sign in.
2. Complete advertiser profile.
3. Add reusable contact/social channels.
4. Create an offer.
5. Choose a saved destination or define an offer-specific custom destination.
6. Fund the Cliqero wallet.
7. Create a campaign for the offer.
8. Reserve part of wallet balance for the campaign.
9. Promoters distribute the campaign.
10. Visitors view the offer freely.
11. Qualified CTA actions consume campaign budget.
12. The advertiser reviews performance and may pause, replenish, or close the campaign.

## Typical promoter journey

1. Register or sign in.
2. Activate promoter capability.
3. Browse active campaigns.
4. Choose campaigns relevant to the promoter's audience.
5. Generate or use the promoter's attributed links.
6. Share them through social media, video descriptions, messaging platforms, blogs, communities, or other channels.
7. Visitors click through and inspect offers.
8. Qualified CTA actions are attributed to the promoter.
9. Earnings move from pending to available according to platform rules.
10. The promoter requests withdrawal when eligible.

## Typical referral journey

1. Existing account shares `r.<domain>/<refCode>`.
2. New visitor registers through the referral route.
3. The referral relationship is stored against the new account.
4. The new account may later become an advertiser, promoter, or both.
5. When a commission processor needs referral distribution, it asks the affiliate/referral capability for the applicable uplines and levels.
6. The affiliate/referral capability returns data only; it does not credit wallets.
