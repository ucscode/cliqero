import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NowPaymentsClient } from "../src";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("NOWPayments protocol client", () => {
  it("uses the custom base URL and forwards the sandbox case", async () => {
    const http = vi.fn().mockResolvedValue(
      response({
        payment_id: "PAY-123",
        payment_status: "waiting",
        pay_address: "TTEST",
        pay_amount: "0.01",
        pay_currency: "usdttrc20",
        expiration_estimate_date: "2026-09-15T12:00:00Z",
      }),
    );
    const client = new NowPaymentsClient({
      apiKey: "test-key",
      apiBaseUrl: "https://api-sandbox.nowpayments.io/",
      http,
    });
    await expect(
      client.createPayment({
        priceAmount: "25.00",
        priceCurrency: "usd",
        payCurrency: "usdttrc20",
        orderId: "np-1",
        orderDescription: "Test",
        sandboxCase: "success",
      }),
    ).resolves.toMatchObject({ payment_id: "PAY-123", pay_amount: "0.01" });
    expect(JSON.parse(http.mock.calls[0][1].body)).toMatchObject({ case: "success" });
    expect(http.mock.calls[0][0].toString()).toBe("https://api-sandbox.nowpayments.io/v1/payment");
  });

  it("preserves exact IPN signature and protocol payload facts", () => {
    const raw = new TextEncoder().encode('{"payment_id":"PAY-123","order_id":"np-1"}');
    const sorted = '{"order_id":"np-1","payment_id":"PAY-123"}';
    const signature = createHmac("sha512", "secret").update(sorted).digest("hex");
    const client = new NowPaymentsClient({
      apiKey: "test-key",
      apiBaseUrl: "https://api.nowpayments.io",
    });
    expect(client.verifyIpnSignature(raw, signature, "secret")).toBe(true);
    expect(client.parseIpnPayload(raw)).toEqual({
      orderId: "np-1",
      paymentId: "PAY-123",
      paymentStatus: null,
    });
  });
});
