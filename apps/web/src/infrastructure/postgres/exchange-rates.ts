import type { SqlExecutor } from "./database";
import type { ExchangeRateCache } from "@/modules/money/exchange-service";
import type { ExchangeRateQuote } from "@/modules/money/exchange";
interface Row {
  from_currency: string;
  to_currency: string;
  rate: string;
  source: string;
  source_date: string | null;
  observed_at: Date;
  fetched_at: Date;
}
export class PostgresExchangeRateCache implements ExchangeRateCache {
  constructor(private readonly sql: SqlExecutor) {}
  async get(fromCurrency: string, toCurrency: string) {
    const row = (
      await this.sql.query<Row>(
        `select from_currency,to_currency,rate,source,source_date,observed_at,fetched_at from money_capability.exchange_rates where from_currency=$1 and to_currency=$2`,
        [fromCurrency, toCurrency],
      )
    ).rows[0];
    return row
      ? {
          fromCurrency: row.from_currency,
          toCurrency: row.to_currency,
          rate: row.rate,
          source: row.source,
          sourceDate: row.source_date ?? undefined,
          observedAt: row.observed_at,
          fetchedAt: row.fetched_at,
        }
      : null;
  }
  async put(quote: ExchangeRateQuote) {
    await this.sql.query(
      `insert into money_capability.exchange_rates(from_currency,to_currency,rate,source,source_date,observed_at,fetched_at) values($1,$2,$3,$4,$5,$6,$7) on conflict(from_currency,to_currency) do update set rate=excluded.rate,source=excluded.source,source_date=excluded.source_date,observed_at=excluded.observed_at,fetched_at=excluded.fetched_at,updated_at=now()`,
      [
        quote.fromCurrency,
        quote.toCurrency,
        quote.rate,
        quote.source,
        quote.sourceDate ?? null,
        quote.observedAt,
        quote.fetchedAt ?? new Date(),
      ],
    );
  }
}
