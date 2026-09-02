import { OperatorShell } from "@/components/operator-shell";
import { OperatorNetwork } from "@/components/operator-network";
import { requireOperatorPage } from "../operator-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OperatorNetworkPage() {
  const access = await requireOperatorPage("/operator/network");
  if (access.role !== "operator") redirect("/operator");
  return (
    <OperatorShell {...access} activeSection="network" title="Network">
      <OperatorNetwork />
    </OperatorShell>
  );
}
