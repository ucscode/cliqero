import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard";

export default function NewPursePage() {
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <DashboardShell purseFormMode="create" />
    </Suspense>
  );
}
