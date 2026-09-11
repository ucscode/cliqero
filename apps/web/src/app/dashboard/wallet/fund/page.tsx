import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

export default function WalletFundingPage() {
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <DashboardShell dedicatedWalletFunding />
    </Suspense>
  );
}
