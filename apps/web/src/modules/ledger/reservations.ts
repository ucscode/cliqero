import type { Money } from "@/modules/money/money";

export interface FundsReservation {
  id: string;
  withdrawalId: string;
  accountId: string;
  amount: Money;
}

/** Domain-facing funds-reservation contract; SQL is implemented by infrastructure. */
export interface LedgerFundsReservationService {
  reserve(input: {
    withdrawalId: string;
    accountId: string;
    amount: Money;
    correlationId: string;
  }): Promise<FundsReservation>;
  available(accountId: string, currency: string): Promise<bigint>;
  releaseOrComplete(input: {
    withdrawalId: string;
    accountId: string;
    kind: "released" | "completed";
    correlationId: string;
  }): Promise<void>;
  summarize(
    accountId: string,
  ): Promise<Array<{ currency: string; reservedMinor: bigint; completedMinor: bigint }>>;
}
