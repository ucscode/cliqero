import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";
import { PaystackPayoutProvider, parsePaystackBankDestination } from "./provider";
const config = { secretKey: "sk_test", apiBaseUrl: "https://api.paystack.co", enabled: true };
const withdrawal = {
  id: "00000000-0000-4000-8000-000000000001",
  accountId: "00000000-0000-4000-8000-000000000002",
  amount: Money.of(12500n, "NGN"),
  destinationType: "bank" as const,
  destinationReference: JSON.stringify({
    bankCode: "058",
    accountNumber: "0001234567",
    accountName: "Jane Doe",
  }),
  state: "approved" as const,
  idempotencyKey: "payout_000000000000001",
  correlationId: "c",
  createdAt: new Date(),
  updatedAt: new Date(),
};
describe("Paystack payout provider", () => {
  it("creates a nuban recipient and submits exact minor units", async () => {
    const http = vi.fn(async (url: string | URL, init?: RequestInit) =>
      String(url).endsWith("transferrecipient")
        ? Response.json({ status: true, message: "ok", data: { recipient_code: "RCP_1" } })
        : Response.json({
            status: true,
            message: "queued",
            data: {
              reference: withdrawal.id.replaceAll("-", "_"),
              transfer_code: "TRF_1",
              status: "pending",
              amount: 12500,
              currency: "NGN",
            },
          }),
    );
    const store = { find: vi.fn(async () => null), save: vi.fn(async () => {}) };
    const result = await new PaystackPayoutProvider(config, store, http).submitPayout({
      withdrawal,
      idempotencyKey: withdrawal.id.replaceAll("-", "_"),
    });
    expect(result.kind).toBe("pending");
    expect(store.save).toHaveBeenCalled();
    const body = JSON.parse(String(http.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      type: "nuban",
      bank_code: "058",
      account_number: "0001234567",
      currency: "NGN",
    });
    expect(JSON.parse(String(http.mock.calls[1][1]?.body)).amount).toBe("12500");
  });
  it("maps authoritative transfer statuses and signs raw webhooks", () => {
    expect(() => parsePaystackBankDestination("{}" as string)).toThrow();
    const p = new PaystackPayoutProvider(
      config,
      { find: async () => "RCP", save: async () => {} },
      vi.fn(),
    );
    const raw = Buffer.from('{"event":"transfer.success"}');
    const sig = createHmac("sha512", config.secretKey).update(raw).digest("hex");
    expect(p.verifyWebhookSignature(raw, sig)).toBe(true);
    const bad = sig[0] === "0" ? "1" + sig.slice(1) : "0" + sig.slice(1);
    expect(p.verifyWebhookSignature(raw, bad)).toBe(false);
  });
  it("treats ambiguous transfer submission failure as unknown", async () => {
    const p = new PaystackPayoutProvider(
      config,
      { find: async () => "RCP", save: async () => {} },
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    await expect(
      p.submitPayout({ withdrawal, idempotencyKey: "payout_1234567890123456" }),
    ).rejects.toMatchObject({ unknownOutcome: true });
  });
});
