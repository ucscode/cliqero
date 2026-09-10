import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";
import { NowPaymentsProvider } from "./provider";

const id = "00000000-0000-4000-8000-000000000001";
const config = {
  apiKey: "test-key",
  ipnSecret: "ipn-secret",
  apiBaseUrl: "https://api-sandbox.nowpayments.io",
  ipnCallbackUrl: "https://public.example.test/api/payments/nowpayments/ipn",
  payCurrency: "usdterc20",
  network: "ERC20",
  asset: "USDT",
  sandboxCase: "success" as const,
};

describe("NOWPayments provider", () => {
  it("creates a payment and persists address/network instructions", async () => {
    const http = vi.fn(async () =>
      Response.json({
        payment_id: 123,
        payment_status: "waiting",
        pay_address: "0xabc",
        pay_amount: "10.25",
        price_amount: 10.25,
        price_currency: "usd",
        pay_currency: "usdterc20",
        order_id: `np-${id}`,
      }),
    );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);
    const result = await provider.initiate({
      paymentId: id,
      amount: Money.of(1025n, "USD"),
      idempotencyKey: "funding-1",
      buyerEmail: "buyer@example.test",
    });
    expect(result.reference).toBe(`np-${id}`);
    expect(result.metadata).toMatchObject({
      providerPaymentId: "123",
      paymentAddress: "0xabc",
      paymentCurrency: "USDTERC20",
      asset: "USDT",
      network: "ERC20",
    });
    expect(http).toHaveBeenCalledWith(
      expect.objectContaining({ href: "https://api-sandbox.nowpayments.io/v1/payment" }),
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "test-key" }),
        body: expect.any(String),
      }),
    );
    const request = (http.mock.calls[0] as unknown as [string | URL, RequestInit] | undefined)?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      case: "success",
      pay_currency: "usdterc20",
      ipn_callback_url: "https://public.example.test/api/payments/nowpayments/ipn",
    });
  });

  it("never sends the sandbox test case to the live API", async () => {
    const http = vi.fn(async () =>
      Response.json({
        payment_id: 123,
        payment_status: "waiting",
        pay_address: "Taddress",
        pay_amount: "10.25",
        price_amount: 10.25,
        price_currency: "usd",
        pay_currency: "usdttrc20",
        order_id: `np-${id}`,
      }),
    );
    const provider = new NowPaymentsProvider(
      { ...config, apiBaseUrl: "https://api.nowpayments.io" },
      "nowpayments",
      http,
    );
    await provider.initiate({
      paymentId: id,
      amount: Money.of(1025n, "USD"),
      idempotencyKey: "funding-live",
      buyerEmail: "buyer@example.test",
    });
    const request = (http.mock.calls[0] as unknown as [string | URL, RequestInit] | undefined)?.[1];
    expect(JSON.parse(String(request?.body))).not.toHaveProperty("case");
  });

  it("verifies only a finished payment and detects amount/reference mismatches", async () => {
    const http = vi.fn(async () =>
      Response.json({
        payment_id: 123,
        payment_status: "finished",
        price_amount: 10.25,
        price_currency: "usd",
        pay_currency: "usdterc20",
        order_id: `np-${id}`,
      }),
    );
    const provider = new NowPaymentsProvider(config, "nowpayments", http);
    const verified = await provider.verify({
      reference: `np-${id}`,
      expectedAmount: Money.of(1025n, "USD"),
      initialization: { providerPaymentId: "123" },
    });
    expect(verified.verified).toBe(true);
    expect(verified.status).toBe("success");
    expect(verified.amount.equals(Money.of(1025n, "USD"))).toBe(true);
    await expect(
      provider.verify({
        reference: "np-other",
        expectedAmount: Money.of(1025n, "USD"),
        initialization: { providerPaymentId: "123" },
      }),
    ).rejects.toThrow("reference mismatch");
  });

  it("rejects a payment on the wrong USDT network/currency", async () => {
    const provider = new NowPaymentsProvider(
      { ...config, payCurrency: "usdttrc20", network: "TRC20" },
      "nowpayments",
      vi.fn(async () =>
        Response.json({
          payment_id: 123,
          payment_status: "finished",
          pay_currency: "usdterc20",
          price_amount: 10.25,
          price_currency: "usd",
          order_id: `np-${id}`,
        }),
      ),
    );
    await expect(
      provider.verify({
        reference: `np-${id}`,
        expectedAmount: Money.of(1025n, "USD"),
        initialization: { providerPaymentId: "123" },
      }),
    ).rejects.toThrow("currency mismatch");
  });

  it("validates the documented sorted-JSON IPN signature", () => {
    const provider = new NowPaymentsProvider(config);
    const body = new TextEncoder().encode(JSON.stringify({ b: 2, a: 1 }));
    const canonical = '{"a":1,"b":2}';
    const signature = createHmac("sha512", "ipn-secret").update(canonical).digest("hex");
    expect(provider.verifyIpnSignature(body, signature)).toBe(true);
    expect(provider.verifyIpnSignature(body, signature.slice(0, -1) + "0")).toBe(false);
  });
});
