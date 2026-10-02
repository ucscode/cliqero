import Link from "next/link";
import { OperatorTreasuryForm } from "@/components/operator/treasury";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function NewTreasuryEntryPage() {
  const access = await requireOperatorPage("/operator/treasury/new");
  return (
    <OperatorShell {...access} activeSection="treasury">
      <div className="grid gap-5">
        <div>
          <Link className="text-sm underline" href="/operator/treasury">
            Back to treasury
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">New treasury entry</h1>
          <p className="mt-2 text-sm text-slate-600">
            Record an approved company-owned treasury movement.
          </p>
        </div>
        <OperatorTreasuryForm />
      </div>
    </OperatorShell>
  );
}
