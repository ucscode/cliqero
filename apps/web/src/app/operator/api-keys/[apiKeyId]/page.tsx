import { OperatorApiKeyEditor } from "@/components/operator/api-keys/editor";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../../operator-access";

export const dynamic = "force-dynamic";

export default async function EditOperatorApiKeyPage({
  params,
}: {
  params: Promise<{ apiKeyId: string }>;
}) {
  const { apiKeyId } = await params;
  const access = await requireOperatorPage(`/operator/api-keys/${apiKeyId}`);
  return (
    <OperatorShell {...access} activeSection="apiKeys">
      <OperatorApiKeyEditor mode="edit" apiKeyId={apiKeyId} />
    </OperatorShell>
  );
}
