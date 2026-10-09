import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { OperatorBlogEditor, OperatorBlogList } from "@/components/operator/blog";
import { OperatorCatalogueEditor, OperatorCatalogueList } from "@/components/operator/catalogue";
import { OperatorApiKeys } from "@/components/operator/api-keys/collection";
import {
  OperatorDistributionDetail,
  OperatorDistributionList,
} from "@/components/operator/distributions";
import {
  EarningsCorrectionHistory,
  EarningsCorrectionSourceSummary,
  OperatorEarningsList,
} from "@/components/operator/earnings";
import { OperatorFundingDetail, OperatorFundingList } from "@/components/operator/funding";
import { OperatorNetwork } from "@/components/operator/network";
import { OperatorReviews } from "@/components/operator/reviews";
import {
  OperatorTreasuryActor,
  OperatorTreasuryCorrelation,
  OperatorTreasuryDetail,
  OperatorTreasuryPage,
  OperatorTreasurySource,
  OperatorTreasuryTraceability,
  treasuryTraceabilityColumns,
} from "@/components/operator/treasury";
import { OperatorUserDetail, OperatorUserForm } from "@/components/operator/users";
import {
  OperatorWithdrawalDetail,
  OperatorWithdrawalList,
} from "@/components/operator/withdrawals";
import { ToastProvider } from "@/components/toast/provider";
import { OperatorConfirmationProvider } from "@/components/operator/ui/confirmation";

function renderPage(element: ReactNode) {
  return renderToStaticMarkup(
    <ToastProvider>
      <OperatorConfirmationProvider>{element}</OperatorConfirmationProvider>
    </ToastProvider>,
  );
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const migratedPages = [
  ["Catalogue", OperatorCatalogueList],
  ["API keys", OperatorApiKeys],
  ["Blog", OperatorBlogList],
  ["Distributions", OperatorDistributionList],
  ["User earnings", OperatorEarningsList],
  ["Wallet funding", OperatorFundingList],
  ["Referral network", OperatorNetwork],
  ["Reviews", OperatorReviews],
  ["Treasury", OperatorTreasuryPage],
  ["Withdrawal requests", OperatorWithdrawalList],
] as const;

describe("operator console shared page migration", () => {
  it("links an Earnings correction to its source context and responsible operator", () => {
    const html = renderPage(
      <>
        <EarningsCorrectionSourceSummary
          accountUsername="seller_one"
          sourceEntryId="source-entry-id"
          purchaseId="purchase-id"
          distributionId="distribution-id"
          correctableAmountMinor="2500"
          onClose={() => undefined}
        />
        <EarningsCorrectionHistory
          capabilities={["accounts.read"]}
          items={[
            {
              id: "correction-id",
              createdBy: "operator-id",
              createdByUsername: "finance_operator",
              accountUsername: "seller_one",
              sourceEntryId: "source-entry-id",
              purchaseId: "purchase-id",
              distributionId: "distribution-id",
              amountMinor: "2500",
              pendingMinor: "0",
              availableMinor: "1800",
              debtMinor: "700",
              reason: "Correct verified allocation",
              correlationId: "correlation-id",
              createdAt: "2026-10-08T12:30:00.000Z",
            },
          ]}
        />
      </>,
    );
    expect(html).toContain('href="/operator/purchases/purchase-id"');
    expect(html).toContain('href="/operator/distributions/distribution-id"');
    expect(html).toContain("source-entry-id");
    expect(html).toContain(
      "Any amount not covered by pending or unreserved Earnings becomes account debt",
    );
    expect(html).toContain('href="/operator/users/operator-id"');
    expect(html).toContain("@finance_operator");
    expect(html).toContain("correlation-id");
    expect(html).toContain("Earnings debt");
  });

  it("shows human-readable Treasury source and actor links", () => {
    const html = renderPage(
      <OperatorTreasuryTraceability
        capabilities={["finance.read", "withdrawals.manage", "accounts.read"]}
        entry={{
          id: "00000000-0000-4000-8000-000000000001",
          direction: "credit",
          amountMinor: "100",
          title: "Platform allocation",
          note: null,
          source: {
            kind: "distribution",
            id: "00000000-0000-4000-8000-000000000002",
          },
          actor: {
            id: null,
            username: null,
            email: null,
            kind: "system",
          },
          correlationId: "00000000-0000-4000-8000-000000000003",
          createdAt: "2026-01-01T00:00:00.000Z",
        }}
      />,
    );
    expect(html).toContain("Purchase distribution");
    expect(html).toContain('href="/operator/distributions/00000000-0000-4000-8000-000000000002"');
    expect(html).toContain("System / automated");
    const humanHtml = renderPage(
      <OperatorTreasuryTraceability
        capabilities={["finance.read", "withdrawals.manage", "accounts.read"]}
        entry={{
          id: "00000000-0000-4000-8000-000000000004",
          direction: "debit",
          amountMinor: "50",
          title: "Withdrawal fee reversal",
          note: null,
          source: {
            kind: "withdrawal_fee_reversal",
            id: "00000000-0000-4000-8000-000000000005",
          },
          actor: {
            id: "00000000-0000-4000-8000-000000000006",
            username: "operator_one",
            email: null,
            kind: "operator",
          },
          correlationId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        }}
      />,
    );
    expect(humanHtml).toContain("Withdrawal fee reversal");
    expect(humanHtml).toContain(
      'href="/operator/withdrawals/00000000-0000-4000-8000-000000000005"',
    );
    expect(humanHtml).toContain("@operator_one");
    expect(humanHtml).toContain('href="/operator/users/00000000-0000-4000-8000-000000000006"');
    const correlationHtml = renderPage(
      <OperatorTreasuryCorrelation correlationId="00000000-0000-4000-8000-000000000003" />,
    );
    expect(correlationHtml).toContain('aria-label="Copy correlation ID"');
    expect(correlationHtml).toContain("00000000-0000-4000-8000-000000000003");
    expect(renderPage(<OperatorTreasuryCorrelation correlationId={null} />)).toContain(
      "Not recorded (historical)",
    );
  });

  it("renders Treasury source and actor as separate compact table columns", () => {
    expect(treasuryTraceabilityColumns().map((column) => column.label)).toEqual([
      "Source",
      "Actor",
    ]);

    const source = renderPage(
      <OperatorTreasurySource
        capabilities={["finance.read"]}
        source={{
          kind: "wallet_transfer",
          id: "transfer-id",
        }}
      />,
    );
    expect(source).toContain("Wallet transfer fee");
    expect(source).toContain("transfer-id");
    expect(source).not.toContain(">Source<");
    expect(renderPage(<OperatorTreasurySource source={null} />)).toContain("Source not recorded");

    const customer = renderPage(
      <OperatorTreasuryActor
        capabilities={["accounts.read"]}
        actor={{
          id: "customer-id",
          username: "customer_one",
          email: null,
          kind: "customer",
        }}
      />,
    );
    expect(customer).toContain('href="/operator/users/customer-id"');
    expect(customer).toContain("@customer_one");
    expect(customer).toContain("Customer");
    expect(customer).not.toContain(">Actor<");

    const operator = renderPage(
      <OperatorTreasuryActor
        capabilities={["accounts.read"]}
        actor={{
          id: "operator-id",
          username: "operator_one",
          email: null,
          kind: "operator",
        }}
      />,
    );
    expect(operator).toContain("Operator");
    expect(
      renderPage(
        <OperatorTreasuryActor actor={{ id: null, username: null, email: null, kind: "system" }} />,
      ),
    ).toContain("System / automated");
    expect(renderPage(<OperatorTreasuryActor actor={null} />)).toContain(
      "Actor not recorded (historical)",
    );
  });

  it.each(migratedPages)("%s renders within the shared page composition", (title, Page) => {
    const html = renderPage(<Page />);
    expect(html).toContain("max-w-[1400px]");
    expect(html).toContain(title);
    expect(html).toContain('role="status"');
  });

  it.each([
    [
      "new catalogue listing",
      <OperatorCatalogueEditor key="catalogue-create" />,
      "Create listing",
      'aria-labelledby="_R_',
    ],
    ["new blog article", <OperatorBlogEditor key="blog-create" />, "New article", "max-w-5xl"],
    ["user create", <OperatorUserForm key="user-create" />, "Create user", "max-w-4xl"],
  ])("%s uses the shared form-page composition", (_name, Page, title, composition) => {
    const html = renderPage(Page);
    expect(html).toContain(title);
    expect(html).toContain(composition);
  });

  it("uses the shared loading state while an existing catalogue listing is fetched", () => {
    const html = renderPage(<OperatorCatalogueEditor listingId="listing-1" />);
    expect(html).toContain("max-w-4xl");
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading listing");
  });

  it("uses the shared detail composition for an individual Treasury entry", () => {
    const html = renderPage(
      <OperatorTreasuryDetail entryId="00000000-0000-4000-8000-000000000001" />,
    );
    expect(html).toContain("Loading Treasury entry");
  });

  it("renders listing fields with distinct labels, helper hierarchy, Markdown, zero price, and access URL semantics", () => {
    const html = renderPage(<OperatorCatalogueEditor />);
    expect(html).toContain('for="listing-short-description"');
    expect(html).toContain("Plain-text customer summary, up to 200 characters.");
    expect(html).toContain("Detailed listing content saved as Markdown.");
    expect(html).toContain("Set 0.00 for a free listing.");
    expect(html).toContain('for="listing-access-url"');
    expect(html).toContain('for="listing-state"');
    expect(html).toContain('value="draft" selected="">Draft');
    expect(html).toContain('value="published">Published');
    expect(html).toContain('value="archived">Archived');
    expect(html).toContain("not the public listing page");
    expect(html).not.toContain("Destination URL");
    expect(html).toContain("react-select");
  });

  it("opens the API-key CRUD collection with search and a create action", () => {
    const html = renderPage(<OperatorApiKeys />);
    expect(html).toContain("API keys");
    expect(html).toContain("New API key");
    expect(html).toContain('type="search"');
    expect(html).toContain("API key collection");
  });

  it("exposes canonical draft/published status in the Blog editor itself", () => {
    const html = renderPage(<OperatorBlogEditor />);
    expect(html).toContain('for="blog-status"');
    expect(html).toContain('id="blog-status"');
    expect(html).toContain("Status");
    expect(html).toContain('value="draft" selected="">Draft');
    expect(html).toContain('value="published">Published');
  });

  it.each([
    ["user detail", <OperatorUserDetail key="user-detail" accountId="account-1" />],
    [
      "distribution detail",
      <OperatorDistributionDetail key="distribution-detail" distributionId="distribution-1" />,
    ],
    ["funding detail", <OperatorFundingDetail key="funding-detail" fundingId="funding-1" />],
    [
      "withdrawal detail",
      <OperatorWithdrawalDetail key="withdrawal-detail" withdrawalId="withdrawal-1" />,
    ],
  ])("%s starts with shared loading state", (_name, Page) => {
    const html = renderPage(Page);
    expect(html).toContain("max-w-[1400px]");
    expect(html).toContain('role="status"');
  });

  it("keeps catalogue transfer tools secondary to the browse surface", () => {
    const html = renderPage(<OperatorCatalogueList capabilities={["catalogue.manage"]} />);
    expect(html).toContain(">Transfer</button>");
    expect(html).toContain("New listing");
    expect(html).toContain(
      "Catalogue managers can permanently delete listings only when no purchase, payment, entitlement, review, or referral history depends on them.",
    );
    expect(html).not.toContain("Manage categories");
    expect(html).not.toContain("Import listings");
  });
});
