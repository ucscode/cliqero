import { OperatorShell } from "@/components/operator-shell";
import { requireOperatorPage } from "./operator-access";

export const dynamic = "force-dynamic";

export default async function OperatorPage() {
  return <OperatorShell {...await requireOperatorPage("/operator")} />;
}
