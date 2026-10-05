import type { EventOutbox } from "@/kernel/events";

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
  findById(id: string, options?: { forUpdate?: boolean }): Promise<ProviderEventRecord | null>;
  markForReprocessing(id: string): Promise<void>;
  markProcessed(id: string): Promise<void>;
  markIgnored(id: string, reason: string): Promise<void>;
  markRejected(id: string, reason: string): Promise<void>;
}
export type { EventOutbox };
