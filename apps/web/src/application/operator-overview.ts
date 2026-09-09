import type { SqlExecutor } from "@/infrastructure/postgres/database";
import { hasCapability, type Capability } from "@/modules/identity/capabilities";

export type OperatorOverview = {
  capabilities: readonly Capability[];
  catalogue: {
    published: number;
    draft: number;
    archived: number;
  };
  users?: { total: number };
  commerce?: { purchases: number };
  withdrawals?: { requested: number; approved: number };
};

function count(value: unknown) {
  return Number(value ?? 0);
}

export class OperatorOverviewService {
  constructor(private readonly sql: SqlExecutor) {}

  async get(capabilities: readonly Capability[]): Promise<OperatorOverview> {
    const catalogue = hasCapability(capabilities, "catalogue.manage")
      ? (
          await this.sql.query<{ published: string; draft: string; archived: string }>(
            `select
               count(*) filter (where state='published')::int published,
               count(*) filter (where state='draft')::int draft,
               count(*) filter (where state='archived')::int archived
             from listing_capability.listings`,
          )
        ).rows[0]
      : undefined;
    const base = {
      capabilities,
      catalogue: {
        published: count(catalogue?.published),
        draft: count(catalogue?.draft),
        archived: count(catalogue?.archived),
      },
    } satisfies OperatorOverview;
    if (!hasCapability(capabilities, "accounts.read")) return base;

    const [users, purchases, withdrawals] = await Promise.all([
      this.sql.query<{ total: string }>(
        `select count(*)::int total from identity_capability.accounts`,
      ),
      this.sql.query<{ total: string }>(
        `select count(*)::int total from purchase_capability.purchases`,
      ),
      this.sql.query<{ requested: string; approved: string }>(
        `select
           count(*) filter (where state='requested')::int requested,
           count(*) filter (where state='approved')::int approved
         from withdrawal_capability.withdrawals`,
      ),
    ]);
    return {
      ...base,
      users: { total: count(users.rows[0]?.total) },
      commerce: { purchases: count(purchases.rows[0]?.total) },
      withdrawals: {
        requested: count(withdrawals.rows[0]?.requested),
        approved: count(withdrawals.rows[0]?.approved),
      },
    };
  }
}
