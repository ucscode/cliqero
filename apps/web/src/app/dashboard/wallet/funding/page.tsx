import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard";

export default function WalletFundingHistoryPage() {
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <DashboardShell fundingHistoryPage />
    </Suspense>
  );
}
