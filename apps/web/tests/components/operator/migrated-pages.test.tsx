import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatorBlogEditor, OperatorBlogList } from "@/components/operator/blog";
import { OperatorCatalogueEditor, OperatorCatalogueList } from "@/components/operator/catalogue";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const migratedPages = [
  ["Catalogue", OperatorCatalogueList],
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
    const html = renderToStaticMarkup(<Page />);
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
    ["new blog article", <OperatorBlogEditor key="blog-create" />, "New article", "max-w-[1400px]"],
    ["user create", <OperatorUserForm key="user-create" />, "Create user", "max-w-4xl"],
  ])("%s uses the shared form-page composition", (_name, Page, title, composition) => {
    const html = renderToStaticMarkup(Page);
    expect(html).toContain(title);
    expect(html).toContain(composition);
  });

  it("uses the shared loading state while an existing catalogue listing is fetched", () => {
    const html = renderToStaticMarkup(<OperatorCatalogueEditor listingId="listing-1" />);
    expect(html).toContain("max-w-[1400px]");
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading listing");
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
    const html = renderToStaticMarkup(Page);
    expect(html).toContain("max-w-[1400px]");
    expect(html).toContain('role="status"');
  });

  it("keeps catalogue transfer tools secondary to the browse surface", () => {
    const html = renderToStaticMarkup(<OperatorCatalogueList />);
    expect(html).toContain("Import and export");
    expect(html).toContain("New listing");
  });
});
