import { describe, expect, it } from "vitest";
import { Money } from "@/modules/money/money";
import { BankTransferProvider } from "./provider";

describe("bank transfer funding provider", () => {
  it("returns explicit persisted instructions and never self-confirms", async () => {
    const provider = new BankTransferProvider({
      accounts: [
        {
          id: "intl-usd",
          fields: [
            { key: "bank_name", label: "Bank Name", value: "Example International Bank" },
            { key: "swift", label: "SWIFT / BIC", value: "EXAMPLEBIC" },
            { key: "iban", label: "IBAN", value: "XX00EXAMPLE" },
          ],
          filters: { countries: null, currencies: ["USD"] },
        },
      ],
    });
    const initialized = await provider.initiate({
      paymentId: "00000000-0000-4000-8000-000000000001",
      amount: Money.of(1250n, "USD"),
      idempotencyKey: "bank-1",
      buyerEmail: "buyer@example.test",
    });
    expect(initialized.reference).toMatch(/^bank-/);
    expect(initialized.metadata?.instructions).toContain("12.50 USD");
    expect(initialized.metadata?.providerAccountId).toBe("intl-usd");
    expect(initialized.metadata?.instructions).toContain("SWIFT / BIC: EXAMPLEBIC");
    expect(initialized.metadata?.instructions).toContain("IBAN: XX00EXAMPLE");
    const verification = await provider.verify({
      reference: initialized.reference,
      expectedAmount: Money.of(1250n, "USD"),
    });
    expect(verification.verified).toBe(false);
    expect(verification.status).toBe("awaiting_manual_confirmation");
  });

  it("selects independently eligible accounts and rejects when none qualify", async () => {
    const provider = new BankTransferProvider({
      accounts: [
        {
          id: "ngn-ng",
          fields: [{ key: "custom", label: "Local instructions", value: "Nigeria Bank" }],
          filters: { countries: ["NG"], currencies: ["NGN"] },
        },
        {
          id: "usd-global",
          fields: [{ key: "custom", label: "Receiving bank", value: "International Bank" }],
          filters: { countries: null, currencies: ["USD"] },
        },
      ],
    });
    expect(provider.eligibleAccounts({ country: "NG", currency: "NGN" })).toHaveLength(1);
    expect(provider.eligibleAccounts({ country: "GB", currency: "USD" })).toHaveLength(1);
    expect(provider.eligibleAccounts({ country: "GB", currency: "NGN" })).toHaveLength(0);
    await expect(
      provider.initiate({
        paymentId: "00000000-0000-4000-8000-000000000002",
        amount: Money.of(1000n, "NGN"),
        idempotencyKey: "bank-2",
        buyerEmail: "buyer@example.test",
        country: "GB",
      }),
    ).rejects.toThrow("No eligible bank-transfer account");
  });

  it("keeps ERC-style optional routing details out of the required model", () => {
    const provider = new BankTransferProvider({
      accounts: [
        {
          id: "local",
          fields: [{ key: "custom", label: "Any field", value: "Local Bank" }],
          filters: { countries: null, currencies: ["USD"] },
        },
      ],
    });
    expect(provider.eligibleAccounts({ country: null, currency: "USD" })).toHaveLength(1);
  });
});
