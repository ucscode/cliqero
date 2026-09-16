import { beforeEach, describe, expect, it, vi } from "vitest";
import { fundingStatusUrl, GET } from "@/app/payments/paystack/callback/route";

const funding = {
  id: "11111111-1111-4111-8111-111111111111",
  state: "awaiting_payment",
  providerName: "paystack",
  providerReference: "pay-example",
};
const findByProviderReference = vi.fn();
const process = vi.fn();

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => ({
    funding: { findByProviderReference },
    fundingVerification: { process },
    payments: { findByProviderReference: vi.fn(async () => null) },
  }),
}));

describe("Paystack browser callback", () => {
  beforeEach(() => {
    findByProviderReference.mockReset();
    process.mockReset();
  });

  it("uses APP_URL rather than a server bind address for browser redirects", () => {
    expect(fundingStatusUrl(funding.id).origin).toBe("http://localhost:3000");
    expect(fundingStatusUrl(funding.id).origin).not.toContain("0.0.0.0");
  });

  it("redirects an existing payment to its persisted funding status", async () => {
    findByProviderReference.mockResolvedValue(funding);
    process.mockResolvedValue({ ...funding, state: "awaiting_payment" });

    const response = await GET(
      new Request(
        "http://localhost:3000/payments/paystack/callback?reference=pay-example&trxref=other",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard/wallet/fund?funding=11111111-1111-4111-8111-111111111111",
    );
    expect(process).toHaveBeenCalledWith(funding.id, { rethrowProviderErrors: false });
  });

  it("delegates pending callbacks to normal verification without inventing a state", async () => {
    findByProviderReference.mockResolvedValue({ ...funding, state: "verification_pending" });

    const response = await GET(
      new Request("http://localhost:3000/payments/paystack/callback?reference=pay-example"),
    );

    expect(response.status).toBe(303);
    expect(process).toHaveBeenCalledWith(funding.id, { rethrowProviderErrors: false });
  });

  it("does not change an already confirmed funding", async () => {
    findByProviderReference.mockResolvedValue({ ...funding, state: "confirmed" });

    const response = await GET(
      new Request("http://localhost:3000/payments/paystack/callback?reference=pay-example"),
    );

    expect(response.status).toBe(303);
    expect(process).not.toHaveBeenCalled();
  });

  it("rejects malformed or unknown references safely", async () => {
    expect(
      (await GET(new Request("http://localhost:3000/payments/paystack/callback"))).status,
    ).toBe(400);
    findByProviderReference.mockResolvedValue(null);
    expect(
      (await GET(new Request("http://localhost:3000/payments/paystack/callback?reference=unknown")))
        .status,
    ).toBe(404);
  });
});
