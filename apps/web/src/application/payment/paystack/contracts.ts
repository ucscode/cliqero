import type { EventOutbox } from "@/kernel/events";
import type { PaymentRecord, PaymentRepository } from "@/modules/payment";

export type ReconciliationState = "started" | "completed" | "skipped" | "mismatch" | "failed";
export interface ReconciliationAttempt {
  id: string;
  paymentId: string;
  idempotencyKey: string;
  state: ReconciliationState;
  result: unknown;
  lastError: string | null;
  actorId: string;
  correlationId: string;
}
export interface ReconciliationOperations {
  begin(input: {
    paymentId: string;
    idempotencyKey: string;
    actorId: string;
    correlationId: string;
  }): Promise<{ attempt: ReconciliationAttempt; created: boolean }>;
  finish(
    id: string,
    state: Exclude<ReconciliationState, "started">,
    result: unknown,
    error?: string,
  ): Promise<void>;
}
export interface PaymentVerificationUseCase {
  process(paymentId: string): Promise<unknown>;
}
export interface PaystackPaymentStore extends PaymentRepository {
  findPendingByProviderOlderThan(
    provider: string,
    olderThan: Date,
    limit: number,
  ): Promise<readonly PaymentRecord[]>;
}
export interface PaystackOperationsInspection {
  listProviderEvents(limit: number): Promise<unknown>;
}
export interface PaystackWebhookVerifier {
  verifyWebhookSignature(rawBody: Uint8Array, signature: string | null): boolean;
}
export interface ProviderEventRecord {
  id: string;
  providerName: string;
  eventKey: string;
  eventType: string;
  providerReference: string | null;
  amountMinor: string | null;
  currency: string | null;
  payload: unknown;
  state: "received" | "processed" | "rejected" | "ignored";
  lastError: string | null;
}
export interface ProviderEventStore {
  record(
    event: Omit<ProviderEventRecord, "state" | "lastError">,
  ): Promise<{ record: ProviderEventRecord; created: boolean }>;
  findById(id: string): Promise<ProviderEventRecord | null>;
  markProcessed(id: string): Promise<void>;
  markIgnored(id: string, reason: string): Promise<void>;
  markRejected(id: string, reason: string): Promise<void>;
}
export type { EventOutbox };
