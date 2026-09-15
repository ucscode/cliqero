import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";

/** Paystack-specific operator projection for persisted provider events. */
export class PostgresPaystackOperationsRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async listProviderEvents(limit: number) {
    return (
      await this.sql.query(
        `select event.id,event.event_type,event.provider_reference,event.amount_minor,event.currency,event.state,event.last_error,event.received_at,event.processed_at,
            payment.uuid payment_id,payment.state payment_state,payment.provider_transaction_id,payment.provider_fee_minor,payment.provider_fee_currency,
            outbox.state outbox_state,outbox.last_error outbox_last_error
     from payment_capability.provider_events event
     left join payment_capability.payments payment on payment.provider_name=event.provider_name and payment.provider_reference=event.provider_reference
     left join kernel.outbox_events outbox on outbox.aggregate_id=event.id and outbox.event_name='payment.paystack.charge-succeeded'
     where event.provider_name='paystack' order by event.received_at desc,event.id limit $1`,
        [limit],
      )
    ).rows;
  }
}
