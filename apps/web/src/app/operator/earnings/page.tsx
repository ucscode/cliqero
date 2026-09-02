import { OperatorEarningsList } from "@/components/operator-earnings";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OperatorEarningsPage() {
  const access = await requireOperatorPage("/operator/earnings");
  if (access.role !== "operator") redirect("/operator");
  return (
    <OperatorShell {...access} activeSection="earnings" title="Earnings">
      <OperatorEarningsList />
    </OperatorShell>
  );
}
