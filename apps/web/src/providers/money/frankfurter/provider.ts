import type { ExchangeRateProvider, ExchangeRateQuote } from "@/modules/money/exchange";
export type FrankfurterHttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;
export class FrankfurterProvider implements ExchangeRateProvider {
  constructor(
    private readonly baseUrl = "https://api.frankfurter.dev/v1",
    private readonly http: FrankfurterHttpClient = fetch,
  ) {}
  async getRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRateQuote> {
    const from = fromCurrency.toUpperCase(),
      to = toCurrency.toUpperCase();
    const response = await this.http(`${this.baseUrl}/latest?base=${from}&symbols=${to}`);
    if (!response.ok) throw new Error("Frankfurter request failed");
    const raw = await response.text();
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("Frankfurter response is invalid JSON");
    }
    if (
      !isRecord(value) ||
      value.base !== from ||
      typeof value.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
    )
      throw new Error("Frankfurter response schema is invalid");
    const rateText = extractRate(raw, to);
    if (!rateText || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rateText) || rateText === "0")
      throw new Error("Frankfurter rate is invalid");
    const observedAt = new Date(`${value.date}T00:00:00.000Z`);
    if (Number.isNaN(observedAt.getTime())) throw new Error("Frankfurter date is invalid");
    return {
      fromCurrency: from,
      toCurrency: to,
      rate: rateText,
      source: "frankfurter",
      sourceDate: value.date,
      observedAt,
      fetchedAt: new Date(),
    };
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function extractRate(raw: string, target: string): string | null {
  const match = raw.match(new RegExp(`"${target}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`));
  return match?.[1] ?? null;
}
