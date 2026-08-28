# Promoters and Referral Network

[Back to documentation index](./README.md)

## Promoter purpose

Promoters distribute attributed Cliqero links and earn when visitors they bring complete qualified campaign actions.

They are not required to complete sales, handle advertiser inventory, or process customer payments.

Their economic role is distribution.

## Promoter identity

A promoter is a capability attached to a normal Cliqero account.

The same account may also be an advertiser and referrer.

Promoter identity should be stable even if campaigns, collections, or links change.

## Promotion link types

Cliqero should support multiple promotion depths because different marketing contexts require different links.

### Specific offer link

Best when the promoter is discussing one particular offer.

Example:

`a.example.com/uche/glamhair/bone-straight`

The visitor lands directly on that offer while promoter attribution is preserved.

### Advertiser-focused link

Best when the promoter recommends a business or advertiser generally.

Example:

`a.example.com/uche/glamhair`

Any eligible CTA action during the attributed session may be credited according to campaign rules.

### Collection link

A promoter may maintain a category or topic collection such as:

`a.example.com/uche/beauty`

Collections can contain selected campaigns or future dynamically eligible campaigns.

### Versatile promoter page

A permanent promoter page such as:

`a.example.com/uche`

can act as a discovery page containing the promoter's chosen recommendations or categories.

This is useful in TikTok, Instagram, YouTube, Telegram, blog bios, and other places where changing links frequently is inconvenient.

## Durable links

A major design goal is to avoid dead promotional links when campaigns end.

Where appropriate, a promoter collection or versatile page may replace exhausted campaigns with currently eligible alternatives while preserving the permanent public URL.

Specific offer links should remain semantically tied to the original offer and must not silently become unrelated offers.

## Attribution

Promotion attribution should be owned by a dedicated capability rather than the promoter module itself.

The attribution layer determines facts such as:

- promoter identity;
- originating link;
- advertiser/offer/campaign context;
- session identity;
- action triggered;
- qualification state;
- attribution window;
- uniqueness/risk signals.

It returns attribution facts for processors to consume.

## Referral is not promotion

Referral and promotion must remain distinct concepts.

Promotion:

`Promoter -> Visitor -> Advertiser offer/action`

Referral:

`Existing account -> New Cliqero account`

The referral graph should not be inferred from campaign activity.

## Referral link

A platform referral link may look like:

`r.example.com/H7K29`

It attributes a new account to the referrer.

The referred account may later act as advertiser, promoter, or both.

## Affiliate/referral capability responsibilities

The affiliate/referral module owns relationship facts.

It should be able to answer questions such as:

- who directly referred this account?
- list direct referrals;
- list downlines by level;
- list uplines;
- what level is account A relative to account B?
- calculate applicable referral recipients for a given distribution policy;
- calculate totals or graph summaries where useful.

It must not:

- credit wallets;
- debit campaigns;
- process withdrawals;
- send payments;
- decide whether an action is valid;
- own payment-provider integrations.

A processor may ask the module for a distribution result and then loop over that result to perform financial consequences through the wallet/ledger capability.

## Reward source

Referral rewards must originate from real platform economic activity, not from account registration fees.

The referral system should remain secondary to the product's genuine advertiser/promoter value proposition.

The platform should remain useful if referral rewards are disabled.

## Distribution rules

Referral levels and reward percentages should be policy/configuration rather than hard-coded business logic.

A distribution request might conceptually return:

```json
{
  "source_user": "promoter-123",
  "recipients": [
    {"user_id": "account-78", "level": 1, "share": "..."},
    {"user_id": "account-21", "level": 2, "share": "..."}
  ]
}
```

The affiliate module returns facts. The commission processor performs money movement.

## Promoter earnings lifecycle

Promoter earnings should use explicit states, for example:

`pending -> available -> withdrawal_reserved -> paid`

Rejected or compensating states may exist as required.

A promoter should be able to distinguish pending earnings from withdrawable balance.
