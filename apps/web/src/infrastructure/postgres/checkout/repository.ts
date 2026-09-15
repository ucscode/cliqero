import { Money } from "@/modules/money/money";
import type { QueryExecutor } from "../shared/database";
import type { Checkout, CheckoutRepository } from "@/modules/checkout/checkout";

export class PostgresCheckoutRepository implements CheckoutRepository {
  constructor(private sql: QueryExecutor) {}
  findById(id: string, o?: { forUpdate?: boolean }) {
    return this.find("c.uuid=$1", [id], o);
  }
  findByIdempotency(b: string, k: string) {
    return this.find(
      "c.buyer_id=(select id from identity_capability.accounts where uuid=$1) and c.idempotency_key=$2",
      [b, k],
    );
  }
  async findAwaitingFunds(limit = 50) {
    const rows = (
      await this.sql.query<any>(
        `select c.*,c.uuid as id,a.uuid as buyer_uuid,l.uuid as listing_uuid,p.uuid as purchase_uuid from checkout_capability.checkouts c join identity_capability.accounts a on a.id=c.buyer_id join listing_capability.listings l on l.id=c.listing_id join purchase_capability.purchases p on p.id=c.purchase_id where c.state='awaiting_funds' order by c.created_at,c.id limit $1`,
        [limit],
      )
    ).rows;
    return rows.map((r) => this.map(r));
  }
  async save(v: Checkout) {
    await this.sql.query(
      `insert into checkout_capability.checkouts(uuid,buyer_id,listing_id,purchase_id,amount_minor,currency,state,idempotency_key,paid_at) values($1,(select id from identity_capability.accounts where uuid=$2),(select id from listing_capability.listings where uuid=$3),(select id from purchase_capability.purchases where uuid=$4),$5,$6,$7,$8,$9) on conflict(uuid) do update set state=excluded.state,paid_at=coalesce(excluded.paid_at,checkout_capability.checkouts.paid_at),updated_at=now()`,
      [
        v.id,
        v.buyerId,
        v.listingId,
        v.purchaseId,
        v.amount.minorAmount.toString(),
        v.amount.currency,
        v.state,
        v.idempotencyKey,
        v.paidAt ?? null,
      ],
    );
  }
  private async find(w: string, v: unknown[], o?: { forUpdate?: boolean }) {
    const r = (
      await this.sql.query<any>(
        `select c.*,c.uuid as id,a.uuid as buyer_uuid,l.uuid as listing_uuid,p.uuid as purchase_uuid from checkout_capability.checkouts c join identity_capability.accounts a on a.id=c.buyer_id join listing_capability.listings l on l.id=c.listing_id join purchase_capability.purchases p on p.id=c.purchase_id where ${w}${o?.forUpdate ? " for update" : ""}`,
        v,
      )
    ).rows[0];
    return r ? this.map(r) : null;
  }
  private map(r: any): Checkout {
    return {
      id: r.id,
      buyerId: r.buyer_uuid ?? r.buyer_id,
      listingId: r.listing_uuid ?? r.listing_id,
      purchaseId: r.purchase_uuid ?? r.purchase_id,
      amount: Money.of(BigInt(r.amount_minor), r.currency),
      state: r.state,
      idempotencyKey: r.idempotency_key,
      paidAt: r.paid_at ?? undefined,
    };
  }
}
