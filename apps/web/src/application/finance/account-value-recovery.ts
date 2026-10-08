import type { AccountDebtService } from "@/application/finance/account-debt";
import type { AccountDebtActor } from "@/modules/ledger/account-debt";

export interface AccountValueRecoveryRepository {
  lockAccount(accountId: string): Promise<void>;
  availableFunding(accountId: string): Promise<bigint>;
  availableEarnings(accountId: string): Promise<bigint>;
}

export class AccountValueRecoveryService {
  constructor(
    private readonly repository: AccountValueRecoveryRepository,
    private readonly debt: AccountDebtService,
  ) {}

  async recover(input: {
    accountId: string;
    amountMinor: bigint;
    sourceId: string;
    reason: string;
    actor: AccountDebtActor;
    correlationId: string;
  }) {
    await this.repository.lockAccount(input.accountId);
    const fundingWalletMinor = min(
      input.amountMinor,
      await this.repository.availableFunding(input.accountId),
    );
    const afterFunding = input.amountMinor - fundingWalletMinor;
    const earningsWalletMinor = min(
      afterFunding,
      await this.repository.availableEarnings(input.accountId),
    );
    const debtMinor = afterFunding - earningsWalletMinor;
    if (debtMinor > 0n)
      await this.debt.increase({
        accountId: input.accountId,
        amountMinor: debtMinor,
        wallet: "account",
        sourceKind: "funding_reversal",
        sourceId: input.sourceId,
        reason: `Unrecovered provider funding reversal: ${input.reason}`,
        actor: input.actor,
        correlationId: input.correlationId,
        idempotencyKey: `debt-increase:funding-reversal:${input.sourceId}`,
      });
    return { fundingWalletMinor, earningsWalletMinor, debtMinor };
  }
}

function min(a: bigint, b: bigint) {
  return a < b ? a : b;
}
