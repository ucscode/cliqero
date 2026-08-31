import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";
import { PaystackProvider, toPaystackSubunit } from "./provider";

const config = {
  secretKey: "sk_test_secret",
  apiBaseUrl: "https://api.paystack.co",
  callbackUrl: "https://cliqero.example/callback",
};
describe("PaystackProvider", () => {
  it("maps checkout initialization using server-owned subunits, email, currency, and reference", async () => {
    const http = vi.fn(async (_input: string | URL, _init?: RequestInit) =>
      Response.json({
        status: true,
        message: "Authorization URL created",
        data: {
          authorization_url: "https://checkout.paystack.com/access",
          access_code: "access",
          reference: "pay-00000000-0000-4000-8000-000000000001",
        },
      }),
    );
    const provider = new PaystackProvider(config, http);
    const result = await provider.initiate({
      paymentId: "00000000-0000-4000-8000-000000000001",
      amount: Money.of(250000n, "NGN"),
      idempotencyKey: "checkout-1",
      buyerEmail: "buyer@example.com",
    });
    const [url, request] = http.mock.calls[0];
    const body = JSON.parse(String(request?.body));
    expect(String(url)).toBe("https://api.paystack.co/transaction/initialize");
    expect(request?.headers).toMatchObject({ authorization: "Bearer sk_test_secret" });
    expect(body).toEqual({
      email: "buyer@example.com",
      amount: "250000",
      currency: "NGN",
      reference: "pay-00000000-0000-4000-8000-000000000001",
      callback_url: "https://cliqero.example/callback",
    });
    expect(result).toMatchObject({
      authorizationUrl: "https://checkout.paystack.com/access",
      accessCode: "access",
    });
  });
  it("preserves exact minor units without floating point conversion", () => {
    expect(toPaystackSubunit(Money.of(10_000_000_000_000_001n, "USD"))).toBe("10000000000000001");
  });
  it("maps authoritative verification facts", async () => {
    const http = vi.fn(async () =>
      Response.json({
        status: true,
        message: "Verification successful",
        data: {
          id: 4099260516,
          status: "success",
          reference: "reference-1",
          amount: 40333,
          currency: "NGN",
          fees: 123,
        },
      }),
    );
    const result = await new PaystackProvider(config, http).verify({
      reference: "reference-1",
      expectedAmount: Money.of(40333n, "NGN"),
    });
    expect(result).toMatchObject({
      verified: true,
      status: "success",
      reference: "reference-1",
      providerTransactionId: "4099260516",
    });
    expect(result.amount).toEqual(Money.of(40333n, "NGN"));
    expect(result.providerFee).toEqual(Money.of(123n, "NGN"));
  });
  it("validates the exact raw webhook payload with HMAC-SHA512", () => {
    const provider = new PaystackProvider(config, vi.fn());
    const raw = Buffer.from('{"event":"charge.success","data":{"id":1}}');
    const signature = createHmac("sha512", config.secretKey).update(raw).digest("hex");
    expect(provider.verifyWebhookSignature(raw, signature)).toBe(true);
    const invalid = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
    expect(provider.verifyWebhookSignature(raw, invalid)).toBe(false);
  });
  it("does not report success when Paystack is unavailable", async () => {
    const provider = new PaystackProvider(
      config,
      vi.fn(async () => {
        throw new Error("network unavailable");
      }),
    );
    await expect(
      provider.verify({ reference: "reference-1", expectedAmount: Money.of(100n, "NGN") }),
    ).rejects.toMatchObject({ kind: "ambiguous", provider: "paystack" });
  });
  it("captures safe structured rejection diagnostics", async () => {
    const http = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: false, message: "Invalid amount" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      new PaystackProvider(config, http).initiate({
        paymentId: "00000000-0000-4000-8000-000000000001",
        amount: Money.of(1n, "NGN"),
        idempotencyKey: "x",
        buyerEmail: "buyer@example.com",
      }),
    ).rejects.toMatchObject({
      provider: "paystack",
      operation: "transaction.initialize",
      httpStatus: 400,
      providerStatus: false,
      providerMessage: "Invalid amount",
      kind: "rejection",
    });
  });
  it("classifies transport failures as ambiguous", async () => {
    const p = new PaystackProvider(config, async () => {
      throw new Error("timeout");
    });
    await expect(
      p.initiate({
        paymentId: "00000000-0000-4000-8000-000000000001",
        amount: Money.of(1n, "NGN"),
        idempotencyKey: "x",
        buyerEmail: "buyer@example.com",
      }),
    ).rejects.toMatchObject({ kind: "ambiguous", operation: "transaction.initialize" });
  });
});
