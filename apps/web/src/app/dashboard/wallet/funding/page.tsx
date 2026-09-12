import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

export default function WalletFundingHistoryPage() {
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <DashboardShell fundingHistoryPage />
    </Suspense>
  );
}
