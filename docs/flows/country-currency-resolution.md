# Country eligibility and currency resolution

Payment `filters.countries` controls only which customer countries may see a
provider or receiving account. It does not select collection currency, alter
canonical accounting, perform conversion, or describe crypto assets.

Cliqero accounts are expected to have a country from registration or onboarding.
The generic funding page uses that country to discover eligible providers and
does not ask for a country or generic currency. Generic funding input is only
the canonical USD amount and provider. Provider preparation owns collection
currency resolution and any provider-specific payment-currency selection.

The optional reference file `apps/web/data/reference/country-currencies.json` maps ISO
alpha-2 country codes to preferred ISO alpha-3 fiat currencies. It contains no
rates. `CountryCurrencyResolver` uses this order when mapping is enabled:

1. receiving-account override;
2. provider override;
3. the shared country mapping;
4. USD.

Disabled or absent mapping returns USD without throwing for an unmapped country.
The existing exchange-rate service remains responsible for the USD-to-collection
quote and immutable conversion snapshot.

Bank transfer may opt into this mapping at provider or account level. The
customer selects an eligible receiving account; that account determines the
resolved collection currency. Paystack continues to use its provider-owned
allowlist and default: the shared mapping supplies a preference, and Paystack
falls back when that preference is not allowed. Neither provider exposes a
generic collection-currency selector. NOWPayments and direct USDT TRC20 retain
provider-owned crypto/asset behavior and do not invoke this mapping.

The preparation and funding APIs return the resolved collection amount and
currency, and persisted funding records retain those immutable facts. They do
not accept `collection_currency` as generic browser input. `payment_currency`
remains a provider-specific NOWPayments choice, while `bank_account_id`
remains the bank-transfer account choice.
