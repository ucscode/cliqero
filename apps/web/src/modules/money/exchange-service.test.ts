import { describe, expect, it, vi } from "vitest";
import { ExchangeRateService } from "./exchange-service";
import type { ExchangeRateProvider, ExchangeRateQuote } from "./exchange";
const quote: ExchangeRateQuote = {
  fromCurrency: "USD",
  toCurrency: "NGN",
  rate: "1500",
  source: "fallback",
  observedAt: new Date(),
};
describe("exchange rate service", () => {
  it("falls back after primary failure", async () => {
    const cache = { get: vi.fn(async () => null), put: vi.fn(async () => {}) };
    const providers: ExchangeRateProvider[] = [
      {
        getRate: vi.fn(async () => {
          throw new Error("down");
        }),
      },
      { getRate: vi.fn(async () => quote) },
    ];
    expect(await new ExchangeRateService(providers, cache).quote("USD", "NGN")).toEqual(quote);
  });
  it("uses fresh cache without providers", async () => {
    const cached = { ...quote, observedAt: new Date() };
    const cache = { get: vi.fn(async () => cached), put: vi.fn(async () => {}) };
    const provider = { getRate: vi.fn() };
    expect(await new ExchangeRateService([provider], cache).quote("USD", "NGN")).toBe(cached);
    expect(provider.getRate).not.toHaveBeenCalled();
  });

  it("shares a cached pair across callers and refreshes it after the TTL", async () => {
    let now = new Date("2026-09-12T10:00:00Z").getTime();
    const values = new Map<string, ExchangeRateQuote>();
    const cache = {
      get: vi.fn(async (from: string, to: string) => values.get(`${from}/${to}`) ?? null),
      put: vi.fn(async (value: ExchangeRateQuote) => {
        values.set(`${value.fromCurrency}/${value.toCurrency}`, value);
      }),
    };
    const getRate = vi.fn(async (from: string, to: string) => ({
      ...quote,
      fromCurrency: from,
      toCurrency: to,
      rate: getRate.mock.calls.length === 1 ? "1300" : "1310",
      fetchedAt: new Date(now),
    }));
    const service = new ExchangeRateService(
      [{ getRate }],
      cache,
      24 * 60 * 60_000,
      48 * 60 * 60_000,
      () => now,
    );

    await expect(service.quote("USD", "NGN")).resolves.toMatchObject({ rate: "1300" });
    await expect(service.quote("USD", "NGN")).resolves.toMatchObject({ rate: "1300" });
    expect(getRate).toHaveBeenCalledTimes(1);
    await expect(service.quote("USD", "GBP")).resolves.toMatchObject({ rate: "1310" });
    expect(getRate).toHaveBeenCalledTimes(2);
    now += 24 * 60 * 60_000 + 1;
    await expect(service.quote("USD", "NGN")).resolves.toMatchObject({ rate: "1310" });
    expect(getRate).toHaveBeenCalledTimes(3);
  });

  it("uses a bounded stale quote only when refresh providers fail", async () => {
    const cached = { ...quote, fetchedAt: new Date("2026-09-11T10:00:00Z") };
    const cache = { get: vi.fn(async () => cached), put: vi.fn(async () => {}) };
    const service = new ExchangeRateService(
      [
        {
          getRate: vi.fn(async () => {
            throw new Error("down");
          }),
        },
      ],
      cache,
      1_000,
      60_000,
      () => new Date("2026-09-11T10:00:30Z").getTime(),
    );
    await expect(service.quote("USD", "NGN")).resolves.toBe(cached);
  });
});
