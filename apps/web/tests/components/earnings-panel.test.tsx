import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  customerEarningAmount,
  customerEarningBadgeVariant,
  EarningsActivity,
  EarningsHighlight,
  earningsEntriesUrl,
} from "@/components/earnings-panel";
import { OverviewEarningsCard } from "@/components/dashboard/overview";
import { findWithdrawableBalance } from "@/components/earnings/withdrawable";

const earningsPanelSource = readFileSync(
  resolve(process.cwd(), "src/components/earnings-panel.tsx"),
  "utf8",
);

const entries = {
  items: [
    {
      id: "entry-1",
      purchase_id: "purchase-secret-uuid",
      entry_type: "purchase-earnings",
      direction: "credit" as const,
      amount_minor: "310",
      currency: "USD",
      recipient_role: "referral",
      balance_state: "available",
      created_at: "2026-01-02T00:00:00.000Z",
      referral_level: 2,
      listing_title_snapshot: "Secret product title",
    },
    {
      id: "entry-2",
      purchase_id: "purchase-seller-uuid",
      entry_type: "purchase-earnings",
      direction: "credit" as const,
      amount_minor: "620",
      currency: "USD",
      recipient_role: "seller",
      balance_state: "available",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "entry-3",
      purchase_id: "purchase-reversal-uuid",
      entry_type: "purchase-reversal",
      direction: "debit" as const,
      amount_minor: "310",
      currency: "USD",
      recipient_role: "referral",
      balance_state: "available",
      created_at: "2025-12-31T00:00:00.000Z",
    },
    {
      id: "entry-4",
      purchase_id: "purchase-seller-reversal-uuid",
      entry_type: "purchase-reversal",
      direction: "debit" as const,
      amount_minor: "310",
      currency: "USD",
      recipient_role: "seller",
      balance_state: "available",
      created_at: "2025-12-30T00:00:00.000Z",
    },
    {
      id: "entry-5",
      purchase_id: null,
      entry_type: "legacy-adjustment",
      direction: "credit" as const,
      amount_minor: "50",
      currency: "USD",
      recipient_role: "platform",
      balance_state: "pending",
      created_at: "2025-12-29T00:00:00.000Z",
    },
  ],
  nextCursor: "next-page-cursor",
};

describe("earnings panel presentation", () => {
  it("uses positive, warning, and neutral treatments for available, pending, and other balances", () => {
    expect(customerEarningBadgeVariant("available")).toBe("default");
    expect(customerEarningBadgeVariant("pending")).toBe("warning");
    expect(customerEarningBadgeVariant("reversed")).toBe("secondary");
  });
  it("uses ledger direction for one visible sign without double-negating debits", () => {
    expect(customerEarningAmount({ direction: "credit", amount_minor: "310" })).toEqual({
      sign: "+",
      minor: "310",
    });
    expect(customerEarningAmount({ direction: "debit", amount_minor: "310" })).toEqual({
      sign: "-",
      minor: "310",
    });
    expect(customerEarningAmount({ direction: "debit", amount_minor: "-310" })).toEqual({
      sign: "-",
      minor: "310",
    });
  });

  it("highlights the withdrawable amount using its projected currency", () => {
    const output = renderToStaticMarkup(
      createElement(EarningsHighlight, {
        withdrawable: { currency: "NGN", amount_minor: "230" },
      }),
    );

    expect(output).toContain("Available earnings");
    expect(output).toContain("Ready for withdrawal");
    expect(output).toContain("NGN");
    expect(output).toContain("2.30");
    expect(earningsPanelSource).toContain("findWithdrawableBalance(summary)");
    expect(earningsPanelSource).not.toContain(
      'summary?.balances.find((balance) => balance.state === "available")',
    );
  });

  it("renders the overview withdrawable balance rather than the raw ledger balance", () => {
    const output = renderToStaticMarkup(
      createElement(OverviewEarningsCard, {
        earnings: {
          balances: [{ currency: "USD", state: "available", amount_minor: "340" }],
          withdrawal_currency: "USD",
          withdrawable_balances: [{ currency: "USD", amount_minor: "230" }],
        },
      }),
    );

    expect(output).toContain("Available earnings");
    expect(output).toContain("$2.30");
    expect(output).not.toContain("$3.40");
    expect(output).toContain("View earnings");
  });

  it("shows unavailable when the overview earnings summary is null", () => {
    const output = renderToStaticMarkup(createElement(OverviewEarningsCard, { earnings: null }));

    expect(output).toContain("Available earnings");
    expect(output).toContain(">—</h2>");
  });

  it("keeps overview safe when a stale response omits withdrawable balances", () => {
    const staleSummary = {
      balances: [{ currency: "USD", state: "available", amount_minor: "340" }],
      withdrawal_currency: "USD",
    } as unknown as Parameters<typeof OverviewEarningsCard>[0]["earnings"];
    const output = renderToStaticMarkup(
      createElement(OverviewEarningsCard, { earnings: staleSummary }),
    );

    expect(output).toContain(">—</h2>");
    expect(output).not.toContain("$3.40");
  });

  it("keeps overview safe when a stale response omits withdrawal currency", () => {
    const staleSummary = {
      balances: [{ currency: "USD", state: "available", amount_minor: "340" }],
      withdrawable_balances: [{ currency: "USD", amount_minor: "230" }],
    } as unknown as Parameters<typeof OverviewEarningsCard>[0]["earnings"];
    const output = renderToStaticMarkup(
      createElement(OverviewEarningsCard, { earnings: staleSummary }),
    );

    expect(output).toContain(">—</h2>");
  });

  it("keeps the earnings summary selector safe for partial runtime responses", () => {
    const staleWithoutProjection = {
      balances: [{ currency: "USD", state: "available", amount_minor: "340" }],
      withdrawal_currency: "USD",
    } as unknown as NonNullable<Parameters<typeof findWithdrawableBalance>[0]>;
    const staleWithoutCurrency = {
      balances: [{ currency: "USD", state: "available", amount_minor: "340" }],
      withdrawable_balances: [{ currency: "USD", amount_minor: "230" }],
    } as unknown as NonNullable<Parameters<typeof findWithdrawableBalance>[0]>;

    expect(findWithdrawableBalance(null)).toBeNull();
    expect(findWithdrawableBalance(staleWithoutProjection)).toBeNull();
    expect(findWithdrawableBalance(staleWithoutCurrency)).toBeNull();
    expect(earningsPanelSource).toContain("findWithdrawableBalance(summary)");
    expect(earningsPanelSource).not.toContain(
      'summary?.balances.find((balance) => balance.state === "available")',
    );
  });

  it("selects the withdrawal-policy currency when multiple balances exist", () => {
    const output = renderToStaticMarkup(
      createElement(OverviewEarningsCard, {
        earnings: {
          balances: [
            { currency: "USD", state: "available", amount_minor: "900" },
            { currency: "NGN", state: "available", amount_minor: "1000" },
          ],
          withdrawal_currency: "NGN",
          withdrawable_balances: [
            { currency: "NGN", amount_minor: "230" },
            { currency: "USD", amount_minor: "800" },
          ],
        },
      }),
    );

    expect(output).toContain("NGN");
    expect(output).toContain("2.30");
    expect(output).not.toContain("$8.00");
  });

  it("uses clear ledger descriptions, signed amounts, and no purchase or product details", () => {
    const output = renderToStaticMarkup(
      createElement(EarningsActivity, {
        entries,
        page: 0,
        onNext: () => undefined,
        onPrevious: () => undefined,
      }),
    );

    expect(output).toContain("Earnings activity");
    expect(output).not.toContain("Purchase purchase-secret-uuid");
    expect(output).not.toContain("Purchase purchase-seller-uuid");
    expect(output).not.toContain("Purchase purchase-reversal-uuid");
    expect(output).not.toContain("Purchase purchase-seller-reversal-uuid");
    const text = output.replace(/<[^>]*>/g, "");
    expect(text).toContain("Available");
    expect(text).toContain("Pending");
    expect(text).toContain("Referral commission");
    expect(text).toContain("Sale proceeds");
    expect(text).toContain("Commission reversal");
    expect(text).toContain("Sale reversal");
    expect(text).toContain("Earnings adjustment");
    expect(text).toContain("+$3.10");
    expect(text).toContain("+$6.20");
    expect(text).toContain("-$3.10");
    expect(text).not.toContain("purchase-earnings");
    expect(text).not.toContain("purchase-reversal");
    expect(text).not.toContain("Level 2");
    expect(text).not.toContain("referral_level");
    expect(text).not.toContain("Secret product title");
    expect(output).toContain("Next");
  });

  it("keeps the empty activity state", () => {
    const output = renderToStaticMarkup(
      createElement(EarningsActivity, {
        entries: { items: [], nextCursor: null },
        page: 0,
        onNext: () => undefined,
        onPrevious: () => undefined,
      }),
    );

    expect(output).toContain("No earnings yet");
    expect(output).toContain("Earnings from qualifying sales and referrals will appear here.");
    expect(output).not.toContain("referral commissions");
    expect(output).not.toContain("referral levels");
  });

  it("supports returning to an older page", () => {
    const output = renderToStaticMarkup(
      createElement(EarningsActivity, {
        entries: { ...entries, nextCursor: null },
        page: 1,
        onNext: () => undefined,
        onPrevious: () => undefined,
      }),
    );

    expect(output).toContain("Previous");
    expect(output).toContain("Page 2");
    expect(output).toContain('type="button" disabled="">Next</button>');
  });

  it("builds cursor pagination requests without losing the page size", () => {
    expect(earningsEntriesUrl()).toBe("/api/earnings/entries?limit=25");
    expect(earningsEntriesUrl("next-page-cursor")).toBe(
      "/api/earnings/entries?limit=25&cursor=next-page-cursor",
    );
  });
});
