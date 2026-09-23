import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EarningsActivity,
  EarningsHighlight,
  earningsEntriesUrl,
} from "@/components/earnings-panel";

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
  ],
  nextCursor: "next-page-cursor",
};

describe("earnings panel presentation", () => {
  it("highlights the available earnings amount", () => {
    const output = renderToStaticMarkup(
      createElement(EarningsHighlight, {
        available: { currency: "USD", state: "available", amount_minor: "12345" },
      }),
    );

    expect(output).toContain("Available earnings");
    expect(output).toContain("Ready for withdrawal");
    expect(output).toContain("$123.45");
  });

  it("keeps activity calm and does not expose purchase UUIDs", () => {
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
    expect(output).not.toContain("bg-red-700");
    expect(output).toContain("$3.10");
    expect(output).toContain("$6.20");
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
