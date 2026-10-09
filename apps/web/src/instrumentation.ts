import { resolveBetterAuthSecret } from "@/infrastructure/identity/secret";
import { verifyProductionDatabaseRole } from "@/infrastructure/postgres/runtime-security";

export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  try {
    resolveBetterAuthSecret();
    await verifyProductionDatabaseRole();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown startup validation error";
    console.error(`Cliqero production startup validation failed: ${message}`);
    process.exit(1);
  }
}
