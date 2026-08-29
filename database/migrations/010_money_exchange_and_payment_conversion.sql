create schema if not exists money_capability;
create table money_capability.exchange_rates (
  from_currency text not null,
  to_currency text not null,
  rate text not null,
  source text not null,
  source_date date,
  observed_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (from_currency,to_currency),
  constraint exchange_rates_currency_codes check (from_currency ~ '^[A-Z]{3}$' and to_currency ~ '^[A-Z]{3}$' and from_currency <> to_currency),
  constraint exchange_rates_positive check (rate ~ '^[0-9]+([.][0-9]+)?$' and rate <> '0')
);

alter table payment_capability.payments add column conversion_snapshot jsonb;
comment on column payment_capability.payments.conversion_snapshot is 'Immutable canonical-to-provider collection conversion facts captured at checkout.';
