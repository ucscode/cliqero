import { OperatorTreasuryForm } from "@/components/operator/treasury";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function NewTreasuryEntryPage() {
  const access = await requireOperatorPage("/operator/treasury/new");
  return (
    <OperatorShell {...access} activeSection="treasury">
      <OperatorTreasuryForm />
    </OperatorShell>
  );
}
