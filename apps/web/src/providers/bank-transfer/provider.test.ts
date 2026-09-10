import { describe, expect, it } from "vitest";
import { Money } from "@/modules/money/money";
import { BankTransferProvider } from "./provider";

describe("bank transfer funding provider", () => {
  it("returns explicit persisted instructions and never self-confirms", async () => {
    const provider = new BankTransferProvider({
      bankName: "Example Bank",
      accountName: "Cliqero Limited",
      accountNumber: "123",
    });
    const initialized = await provider.initiate({
      paymentId: "00000000-0000-4000-8000-000000000001",
      amount: Money.of(1250n, "USD"),
      idempotencyKey: "bank-1",
      buyerEmail: "buyer@example.test",
    });
    expect(initialized.reference).toMatch(/^bank-/);
    expect(initialized.metadata?.instructions).toContain("12.50 USD");
    const verification = await provider.verify({
      reference: initialized.reference,
      expectedAmount: Money.of(1250n, "USD"),
    });
    expect(verification.verified).toBe(false);
    expect(verification.status).toBe("awaiting_manual_confirmation");
  });
});
