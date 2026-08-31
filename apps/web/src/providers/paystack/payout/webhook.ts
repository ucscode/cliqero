import { createHash } from "node:crypto";
import { newId } from "@/kernel/ids";
import type { PaystackPayoutProvider } from "./provider";
import type { PostgresPaystackPayoutEventRepository } from "../persistence/payout-events";
import type { PostgresPayoutRepository } from "@/infrastructure/postgres/payouts";
import type { PayoutExecutionProcessor } from "@/processors/payout-execution";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { Money } from "@/modules/money/money";
export class PaystackPayoutWebhookIngress {
  constructor(
    private readonly provider: PaystackPayoutProvider,
    private readonly events: PostgresPaystackPayoutEventRepository,
    private readonly payouts: PostgresPayoutRepository,
    private readonly execution: PayoutExecutionProcessor,
    private readonly uow: UnitOfWork,
  ) {}
  async ingest(raw: Uint8Array, signature: string | null) {
    if (!this.provider.verifyWebhookSignature(raw, signature)) return { authenticated: false };
    let value: unknown;
    try {
      value = JSON.parse(Buffer.from(raw).toString("utf8"));
    } catch {
      throw new Error("Invalid Paystack webhook JSON");
    }
    if (!isTransfer(value)) return { authenticated: true, accepted: false };
    const event = value as TransferEvent;
    const key = `${event.event}:${event.data.id}`;
    return this.uow.transaction(async () => {
      const created = await this.events.record({
        id: newId(),
        eventKey: key,
        eventType: event.event,
        providerReference: event.data.reference,
        amountMinor: String(event.data.amount),
        currency: event.data.currency,
        payload: event,
      });
      if (!created) return { authenticated: true, accepted: true, duplicate: true };
      const attempt = await this.payouts.findAttemptByProviderReference(
        "paystack",
        event.data.reference,
      );
      if (!attempt) {
        await this.events.markIgnored(key, "Unknown payout reference");
        return { authenticated: true, accepted: false };
      }
      if (attempt.state === "succeeded") {
        await this.events.markIgnored(key, "Payout already completed");
        return { authenticated: true, accepted: true };
      }
      const withdrawalId = attempt.withdrawalId;
      const result =
        event.event === "transfer.success"
          ? {
              kind: "succeeded" as const,
              providerReference: event.data.reference,
              providerTransactionReference: event.data.transfer_code,
              amount: Money.of(BigInt(event.data.amount), event.data.currency),
              currency: event.data.currency,
            }
          : {
              kind: "failed" as const,
              providerReference: event.data.reference,
              category: "provider_rejection" as const,
              reason: `Paystack transfer ${event.event}`,
            };
      await this.execution.applyProviderResult(withdrawalId, result, newId());
      return { authenticated: true, accepted: true, duplicate: false };
    });
  }
}
type TransferEvent = {
  event: "transfer.success" | "transfer.failed" | "transfer.reversed";
  data: {
    id: number;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    transfer_code?: string;
  };
};
function isTransfer(value: unknown): value is TransferEvent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    v.event !== "transfer.success" &&
    v.event !== "transfer.failed" &&
    v.event !== "transfer.reversed"
  )
    return false;
  const d = v.data as Record<string, unknown> | undefined;
  return (
    !!d &&
    Number.isSafeInteger(d.id) &&
    typeof d.reference === "string" &&
    Number.isSafeInteger(d.amount) &&
    typeof d.currency === "string" &&
    typeof d.status === "string"
  );
}
