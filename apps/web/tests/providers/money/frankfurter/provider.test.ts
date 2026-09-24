import { describe, expect, it, vi } from "vitest";
import { FrankfurterProvider } from "@/providers/money/frankfurter/provider";
describe("Frankfurter provider", () => {
  it("preserves the exact decimal digits in a quote", async () => {
    const p = new FrankfurterProvider(
      "https://fx",
      vi.fn(
        async () =>
          new Response(
            '{"amount":1,"base":"USD","date":"2026-08-29","rates":{"NGN":1500.270000000000000123456789}}',
          ),
      ),
    );
    const q = await p.getRate("USD", "NGN");
    expect(q.rate).toBe("1500.270000000000000123456789");
    expect(q.source).toBe("frankfurter");
  });
  it("rejects malformed or missing rates", async () => {
    const p = new FrankfurterProvider(
      "https://fx",
      vi.fn(async () => new Response('{"base":"USD","date":"2026-08-29","rates":{}}')),
    );
    await expect(p.getRate("USD", "NGN")).rejects.toThrow();
  });

  it("rejects a mismatched base and non-positive rate", async () => {
    for (const body of [
      '{"base":"EUR","date":"2026-08-29","rates":{"NGN":1500}}',
      '{"base":"USD","date":"2026-08-29","rates":{"NGN":0.000}}',
    ]) {
      const provider = new FrankfurterProvider(
        "https://fx",
        vi.fn(async () => new Response(body)),
      );
      await expect(provider.getRate("USD", "NGN")).rejects.toThrow();
    }
  });
});
