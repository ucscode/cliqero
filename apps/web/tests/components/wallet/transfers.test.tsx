import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  walletBalanceNameLabel,
  walletSwapDestination,
  WalletTransferForm,
} from "@/components/wallet/transfers";

describe("Wallet/Earnings swap form", () => {
  it("maps customer-facing Wallet labels without changing the funding ledger name", () => {
    expect(walletBalanceNameLabel("funding")).toBe("Wallet");
    expect(walletBalanceNameLabel("earnings")).toBe("Earnings");
    expect(walletBalanceNameLabel(walletSwapDestination("funding"))).toBe("Earnings");
    expect(walletBalanceNameLabel(walletSwapDestination("earnings"))).toBe("Wallet");
  });

  it("renders a selectable source, read-only destination, and PIN immediately before submit", () => {
    const html = renderToStaticMarkup(
      createElement(WalletTransferForm, {
        availableBalances: { funding: "2500", earnings: "900" },
        onComplete: () => {},
      }),
    );

    expect(html).toContain("Swap balance");
    expect(html).toContain('<option value="funding" selected="">Wallet</option>');
    expect(html).toContain('<option value="earnings">Earnings</option>');
    expect(html).toContain("Available in Wallet");
    expect(html).not.toContain(">Funding</option>");
    expect(html).not.toContain('id="transfer-to"');

    const pin = html.indexOf('id="transfer-transaction-pin"');
    const submit = html.indexOf(">Swap balance</button>");
    expect(pin).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(pin);
  });
});
