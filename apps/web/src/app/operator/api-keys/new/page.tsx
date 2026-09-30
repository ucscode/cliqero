import { OperatorApiKeyEditor } from "@/components/operator/api-keys/editor";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function NewOperatorApiKeyPage() {
  const access = await requireOperatorPage("/operator/api-keys/new");
  return (
    <OperatorShell {...access} activeSection="apiKeys">
      <OperatorApiKeyEditor mode="create" />
    </OperatorShell>
  );
}
