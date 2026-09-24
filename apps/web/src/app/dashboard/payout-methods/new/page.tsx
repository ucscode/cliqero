import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard";

export default function NewPayoutMethodPage() {
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <DashboardShell payoutMethodFormMode="create" />
    </Suspense>
  );
}
