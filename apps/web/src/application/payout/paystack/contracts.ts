import type { UnitOfWork } from "@/kernel/unit-of-work";

export interface PaystackPayoutVerifier {
  verifyWebhookSignature(rawBody: Uint8Array, signature: string | null): boolean;
}
export interface PaystackPayoutEventStore {
  record(input: {
    id: string;
    eventKey: string;
    eventType: string;
    providerReference: string;
    amountMinor: string;
    currency: string;
    payload: unknown;
  }): Promise<boolean>;
  markIgnored(eventKey: string, reason: string): Promise<void>;
}
export interface PayoutAttemptStore {
  findAttemptByProviderReference(
    provider: string,
    reference: string,
  ): Promise<{ state: string; withdrawalId: string } | null>;
}
export interface PayoutExecutionUseCase {
  applyProviderResult(
    withdrawalId: string,
    result: unknown,
    idempotencyKey: string,
  ): Promise<unknown>;
}
export type { UnitOfWork };
