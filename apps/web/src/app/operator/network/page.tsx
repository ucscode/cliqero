import { OperatorShell } from "@/components/operator-shell";
import { OperatorNetwork } from "@/components/operator-network";
import { requireOperatorPage } from "../operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorNetworkPage() {
  const access = await requireOperatorPage("/operator/network");
  return (
    <OperatorShell {...access} activeSection="network" title="Network">
      <OperatorNetwork />
    </OperatorShell>
  );
}
