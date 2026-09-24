import type { ExchangeRateProvider, ExchangeRateQuote } from "@/modules/money/exchange";
import { isLosslessNumber, parse as parseLosslessJson } from "lossless-json";
export type FawazHttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;
export class FawazProvider implements ExchangeRateProvider {
  constructor(
    private readonly urls = [
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
      "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json",
    ],
    private readonly http: FawazHttpClient = fetch,
  ) {}
  async getRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRateQuote> {
    if (fromCurrency.toUpperCase() !== "USD")
      throw new Error("Fawaz provider currently supports USD base only");
    const to = toCurrency.toLowerCase();
    let last: unknown;
    for (const url of this.urls) {
      try {
        const response = await this.http(url);
        if (!response.ok) throw new Error("Fawaz request failed");
        const raw = await response.text();
        let value: unknown;
        try {
          value = parseLosslessJson(raw);
        } catch {
          throw new Error("Fawaz response is invalid JSON");
        }
        if (
          !isRecord(value) ||
          typeof value.date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
        )
          throw new Error("Fawaz response schema is invalid");
        const rates = isRecord(value.usd) ? value.usd : undefined;
        const rate = rates?.[to];
        const rateText = isLosslessNumber(rate) ? rate.toString() : null;
        if (!isPositiveDecimal(rateText)) throw new Error("Fawaz rate is invalid");
        const observedAt = new Date(`${value.date}T00:00:00.000Z`);
        return {
          fromCurrency: "USD",
          toCurrency: toCurrency.toUpperCase(),
          rate: rateText,
          source: "fawaz",
          sourceDate: value.date,
          observedAt,
          fetchedAt: new Date(),
        };
      } catch (error) {
        last = error;
      }
    }
    throw last instanceof Error ? last : new Error("Fawaz request failed");
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isPositiveDecimal(value: string | null): value is string {
  return !!value && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && /[1-9]/.test(value);
}
