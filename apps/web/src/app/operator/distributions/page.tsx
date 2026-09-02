import { OperatorDistributionList } from "@/components/operator-distributions";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OperatorDistributionsPage() {
  const access = await requireOperatorPage("/operator/distributions");
  if (access.role !== "operator") redirect("/operator");
  return (
    <OperatorShell {...access} activeSection="distributions" title="Distributions">
      <OperatorDistributionList />
    </OperatorShell>
  );
}
