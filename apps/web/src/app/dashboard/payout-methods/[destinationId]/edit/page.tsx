import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard";

export default async function EditPayoutMethodPage({
  params,
}: {
  params: Promise<{ destinationId: string }>;
}) {
  const { destinationId } = await params;
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <DashboardShell payoutMethodFormMode="edit" payoutDestinationId={destinationId} />
    </Suspense>
  );
}
