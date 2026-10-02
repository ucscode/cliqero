import Link from "next/link";
import { OperatorEarningsAdjustmentForm } from "@/components/operator/earnings-adjustments";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewEarningsAdjustmentPage() {
  const access = await requireOperatorPage("/operator/earnings-adjustments/new");
  if (!hasCapability(access.capabilities, "finance.manage"))
    redirect("/operator/earnings-adjustments");
  return (
    <OperatorShell {...access} activeSection="adjustments">
      <div className="grid gap-5">
        <div>
          <Link className="text-sm underline" href="/operator/earnings-adjustments">
            Back to adjustments
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">New adjustment</h1>
          <p className="mt-2 text-sm text-slate-600">
            Post a signed earnings adjustment for an account.
          </p>
        </div>
        <OperatorEarningsAdjustmentForm />
      </div>
    </OperatorShell>
  );
}
