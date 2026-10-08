import { resolveBetterAuthSecret } from "@/infrastructure/identity/secret";
import { verifyProductionDatabaseRole } from "@/infrastructure/postgres/runtime-security";

export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  resolveBetterAuthSecret();
  await verifyProductionDatabaseRole();
}
