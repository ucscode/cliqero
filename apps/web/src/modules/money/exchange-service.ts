import { DomainInvariantError } from "@/kernel/errors";
import type { ExchangeRateProvider, ExchangeRateQuote } from "./exchange";

export interface ExchangeRateCache {
  get(fromCurrency: string, toCurrency: string): Promise<ExchangeRateQuote | null>;
  put(quote: ExchangeRateQuote): Promise<void>;
}

export class ExchangeRateUnavailableError extends Error {
  constructor() {
    super("Exchange rate is unavailable");
  }
}

export class ExchangeRateService {
  constructor(
    private readonly providers: readonly ExchangeRateProvider[],
    private readonly cache: ExchangeRateCache,
    private readonly freshTtlMs = 6 * 60 * 60_000,
    private readonly staleTtlMs = 48 * 60 * 60_000,
  ) {}
  async quote(fromCurrency: string, toCurrency: string): Promise<ExchangeRateQuote> {
    const from = fromCurrency.trim().toUpperCase(),
      to = toCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to)
      throw new DomainInvariantError("Unsupported conversion pair");
    const cached = await this.cache.get(from, to);
    const now = Date.now();
    if (cached && now - (cached.fetchedAt ?? cached.observedAt).getTime() <= this.freshTtlMs)
      return cached;
    for (const provider of this.providers) {
      try {
        const quote = await provider.getRate(from, to);
        await this.cache.put(quote);
        return quote;
      } catch {
        /* try fallback */
      }
    }
    if (cached && now - (cached.fetchedAt ?? cached.observedAt).getTime() <= this.staleTtlMs)
      return cached;
    throw new ExchangeRateUnavailableError();
  }
}
