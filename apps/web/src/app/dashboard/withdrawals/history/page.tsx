import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard";

export default function WithdrawalHistoryPage() {
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <DashboardShell withdrawalHistoryPage />
    </Suspense>
  );
}
