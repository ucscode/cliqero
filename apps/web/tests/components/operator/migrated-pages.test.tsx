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
import { OperatorEarningsList } from "@/components/operator/earnings";
import { OperatorFundingDetail, OperatorFundingList } from "@/components/operator/funding";
import { OperatorNetwork } from "@/components/operator/network";
import { OperatorReviews } from "@/components/operator/reviews";
import { OperatorTreasuryPage } from "@/components/operator/treasury";
import { OperatorUserDetail, OperatorUserForm } from "@/components/operator/users";
import {
  OperatorWithdrawalDetail,
  OperatorWithdrawalList,
} from "@/components/operator/withdrawals";
import { ToastProvider } from "@/components/toast/provider";

function renderPage(element: ReactNode) {
  return renderToStaticMarkup(<ToastProvider>{element}</ToastProvider>);
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
    const html = renderPage(<OperatorCatalogueList />);
    expect(html).toContain(">Transfer</button>");
    expect(html).toContain("New listing");
    expect(html).toContain("Root deletion removes the listing");
    expect(html).not.toContain("Manage categories");
    expect(html).not.toContain("Import listings");
  });
});
