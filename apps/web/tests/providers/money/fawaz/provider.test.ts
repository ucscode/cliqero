import { describe, expect, it, vi } from "vitest";
import { FawazProvider } from "@/providers/money/fawaz/provider";
describe("Fawaz provider", () => {
  it("preserves the exact decimal digits of a USD table rate", async () => {
    const p = new FawazProvider(
      ["https://fx"],
      vi.fn(
        async () =>
          new Response('{"date":"2026-08-29","usd":{"ngn":1500.270000000000000123456789}}'),
      ),
    );
    const q = await p.getRate("USD", "NGN");
    expect(q.rate).toBe("1500.270000000000000123456789");
  });

  it("rejects missing, zero, and malformed provider rates", async () => {
    for (const body of [
      '{"date":"2026-08-29","usd":{}}',
      '{"date":"2026-08-29","usd":{"ngn":0.000}}',
      '{"date":"invalid","usd":{"ngn":1500}}',
    ]) {
      const provider = new FawazProvider(
        ["https://fx"],
        vi.fn(async () => new Response(body)),
      );
      await expect(provider.getRate("USD", "NGN")).rejects.toThrow();
    }
  });
});
