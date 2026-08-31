import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <DashboardShell />
    </Suspense>
  );
}
