import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { SettlementPolicy, SettlementPolicyRepository } from "@/modules/ledger/settlement";

export class PostgresSettlementPolicyRepository implements SettlementPolicyRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async getActive(): Promise<SettlementPolicy> {
    const row = (
      await this.sql.query<{
        initial_balance_state: "pending" | "available";
        settlement_delay_seconds: number;
      }>(
        `select initial_balance_state,settlement_delay_seconds from ledger_capability.distribution_policy where singleton=true`,
      )
    ).rows[0];
    return {
      defaultBalanceState: row?.initial_balance_state ?? "pending",
      settlementDelaySeconds: row?.settlement_delay_seconds ?? 0,
    };
  }
}
