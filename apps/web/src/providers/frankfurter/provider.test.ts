import { describe, expect, it, vi } from "vitest";
import { FrankfurterProvider } from "./provider";
describe("Frankfurter provider", () => {
  it("parses an exact decimal quote", async () => {
    const p = new FrankfurterProvider(
      "https://fx",
      vi.fn(
        async () =>
          new Response('{"amount":1,"base":"USD","date":"2026-08-29","rates":{"NGN":1500.27}}'),
      ),
    );
    const q = await p.getRate("USD", "NGN");
    expect(q.rate).toBe("1500.27");
    expect(q.source).toBe("frankfurter");
  });
  it("rejects malformed or missing rates", async () => {
    const p = new FrankfurterProvider(
      "https://fx",
      vi.fn(async () => new Response('{"base":"USD","date":"2026-08-29","rates":{}}')),
    );
    await expect(p.getRate("USD", "NGN")).rejects.toThrow();
  });
});
