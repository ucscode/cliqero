import { newId } from "@/kernel/ids";
import { PublicApplicationError } from "@/kernel/errors";
import type { EventOutbox } from "@/kernel/events";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { IdempotencyStore } from "@/application/checkout/contracts";
import type { AuditRecorder } from "@/application/shared/audit";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { ProviderEventStore } from "./contracts";

export type ProviderEventReprocessResult = {
  eventId: string;
  state: "queued" | "already_processed";
  applied: boolean;
  correlationId: string;
};

/** Requeues immutable Paystack ingress evidence through its existing worker handler. */
export class PaystackProviderEventReprocessingService {
  constructor(
    private readonly events: ProviderEventStore,
    private readonly outbox: EventOutbox,
    private readonly operators: OperatorAuthorizationService,
    private readonly idempotency: IdempotencyStore,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {}

  async reprocess(input: { actorId: string; eventId: string; idempotencyKey: string }) {
    await this.operators.requireCapability(input.actorId, "finance.manage");
    const key = input.idempotencyKey.trim();
    if (!key || key.length > 200)
      throw new PublicApplicationError(
        "A valid Idempotency-Key is required.",
        "invalid_idempotency_key",
        400,
      );

    return this.uow.transaction(async () => {
      const scope = "provider-event-reprocessing";
      if (!(await this.idempotency.begin(scope, key))) {
        const previous = await this.idempotency.findCompleted(scope, key);
        if (!previous || previous.resultReference !== input.eventId)
          throw new PublicApplicationError(
            "Idempotency key was used for a different provider event.",
            "idempotency_conflict",
            409,
          );
        return previous.response as ProviderEventReprocessResult;
      }

      const event = await this.events.findById(input.eventId, { forUpdate: true });
      if (!event) throw new PublicApplicationError("Provider event not found.", "not_found", 404);
      if (event.providerName !== "paystack")
        throw new PublicApplicationError(
          "This provider event has no supported reprocessing handler.",
          "provider_event_not_reprocessable",
          409,
        );
      const eventName = reprocessingEventName(event.eventType);
      if (!eventName)
        throw new PublicApplicationError(
          "This provider event type has no supported reprocessing handler.",
          "provider_event_not_reprocessable",
          409,
        );

      if (event.state === "processed") {
        const result: ProviderEventReprocessResult = {
          eventId: event.id,
          state: "already_processed",
          applied: false,
          correlationId: event.id,
        };
        await this.idempotency.complete(scope, key, event.id, result);
        return result;
      }
      if (event.state !== "rejected")
        throw new PublicApplicationError(
          "Only rejected provider events can be manually reprocessed.",
          "provider_event_state_conflict",
          409,
        );

      await this.events.markForReprocessing(event.id);
      const correlationId = newId();
      await this.outbox.append([
        {
          id: newId(),
          name: eventName,
          aggregateId: event.id,
          correlationId,
          occurredAt: new Date(),
          payload: { providerEventId: event.id, reprocess: true },
        },
      ]);
      const result: ProviderEventReprocessResult = {
        eventId: event.id,
        state: "queued",
        applied: true,
        correlationId,
      };
      await this.audit.record({
        actorId: input.actorId,
        action: "payment.provider_event.reprocess_queued",
        subjectType: "provider_event",
        subjectId: event.id,
        previousState: { state: event.state, lastError: event.lastError },
        newState: result,
      });
      await this.idempotency.complete(scope, key, event.id, result);
      return result;
    });
  }
}

function reprocessingEventName(eventType: string): string | null {
  if (eventType === "charge.success") return "payment.paystack.charge-succeeded";
  if (eventType === "refund.processed") return "payment.paystack.refund-processed";
  return null;
}
