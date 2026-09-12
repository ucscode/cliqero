import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { canonicalWalletFundingUrl, safeContinuation } from "@/lib/api-client";

type DashboardSearchParams = Promise<Record<string, string | string[] | undefined>>;

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: DashboardSearchParams;
}) {
  const params = await searchParams;
  if (queryValue(params.section) === "wallet" && queryValue(params.item) === "fund") {
    const buy = queryValue(params.buy);
    const checkout = queryValue(params.checkout);
    const fallback = buy
      ? `/dashboard?buy=${encodeURIComponent(buy)}${
          checkout ? `&checkout=${encodeURIComponent(checkout)}` : ""
        }`
      : "/dashboard";
    const returnTo = safeContinuation(queryValue(params.return), fallback);
    return redirect(canonicalWalletFundingUrl(returnTo));
  }
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <DashboardShell />
    </Suspense>
  );
}
