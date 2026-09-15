import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PaystackClient } from "../src";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Paystack protocol client", () => {
  it("initializes, verifies, and preserves Paystack request boundaries", async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          status: true,
          message: "Initialized",
          data: {
            authorization_url: "https://paystack.test/authorize",
            access_code: "access",
            reference: "pay-1",
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          status: true,
          message: "Verified",
          data: { id: 1, status: "success", reference: "pay-1", amount: 1000, currency: "NGN" },
        }),
      );
    const client = new PaystackClient({
      secretKey: "test-secret",
      apiBaseUrl: "https://api.paystack.test",
      http,
    });

    await expect(
      client.initializeTransaction({
        email: "customer@example.test",
        amountMinor: "1000",
        currency: "NGN",
        reference: "pay-1",
      }),
    ).resolves.toMatchObject({ reference: "pay-1" });
    await expect(client.verifyTransaction("pay-1")).resolves.toMatchObject({ id: 1 });
    expect(http).toHaveBeenNthCalledWith(
      1,
      new URL("https://api.paystack.test/transaction/initialize"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("validates webhook signatures over the raw body", () => {
    const body = new TextEncoder().encode('{"event":"charge.success"}');
    const signature = createHmac("sha512", "test-secret").update(body).digest("hex");
    const client = new PaystackClient({
      secretKey: "test-secret",
      apiBaseUrl: "https://api.paystack.test",
    });
    expect(client.verifyWebhookSignature(body, signature)).toBe(true);
    expect(client.verifyWebhookSignature(body, "0".repeat(128))).toBe(false);
  });
});
