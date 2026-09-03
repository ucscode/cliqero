import { OperatorTreasuryPage } from "@/components/operator-treasury";
import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "../operator-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OperatorTreasuryPageRoute() {
  const access = await requireOperatorPage("/operator/treasury");
  if (access.role !== "operator") redirect("/operator");
  return (
    <OperatorShell {...access} activeSection="treasury" title="Treasury">
      <OperatorTreasuryPage />
    </OperatorShell>
  );
}
