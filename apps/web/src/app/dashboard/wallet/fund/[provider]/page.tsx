import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

type ProviderFundingPageProps = {
  params: Promise<{ provider: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProviderFundingPage({
  params,
  searchParams,
}: ProviderFundingPageProps) {
  const [{ provider }, query] = await Promise.all([params, searchParams]);
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <DashboardShell
        dedicatedWalletFunding
        fundingProvider={provider}
        fundingAmount={first(query.amount)}
      />
    </Suspense>
  );
}
