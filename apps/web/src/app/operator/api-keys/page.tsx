import { OperatorApiKeys } from "@/components/operator/api-keys/collection";
import { OperatorShell } from "@/components/operator/shell";
import { requireOperatorPage } from "../operator-access";
import { hasCapability } from "@/modules/identity/capabilities";

export default async function OperatorApiKeysPage() {
  const access = await requireOperatorPage("/operator/api-keys");
  return (
    <OperatorShell {...access} activeSection="apiKeys">
      <OperatorApiKeys canDelete={hasCapability(access.capabilities, "api_keys.manage")} />
    </OperatorShell>
  );
}
