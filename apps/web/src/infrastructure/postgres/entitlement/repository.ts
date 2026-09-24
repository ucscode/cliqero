import {
  Entitlement,
  type EntitlementRepository,
  type EntitlementState,
} from "@/modules/entitlement/entitlement";
import type { QueryExecutor } from "../shared/database";

interface EntitlementRow {
  id: string;
  buyer_id: string;
  listing_id: string;
  purchase_id: string;
  state: EntitlementState;
  expires_at: Date | null;
}

export class PostgresEntitlementRepository implements EntitlementRepository {
  constructor(private readonly sql: QueryExecutor) {}
  async findByPurchaseId(purchaseId: string) {
    return this.find("purchase_id = (select id from purchase_capability.purchases where uuid=$1)", [
      purchaseId,
    ]);
  }
  async findActive(buyerId: string, listingId: string) {
    return this.find(
      "buyer_id = (select id from identity_capability.accounts where uuid=$1) and listing_id = (select id from listing_capability.listings where uuid=$2) and state = 'active' and (expires_at is null or expires_at > now())",
      [buyerId, listingId],
    );
  }
  async findById(id: string, options?: { forUpdate?: boolean }) {
    return this.find("uuid = $1", [id], options?.forUpdate);
  }
  async save(entitlement: Entitlement): Promise<void> {
    await this.sql.query(
      `insert into entitlement_capability.entitlements (uuid,buyer_id,listing_id,purchase_id,state,expires_at)
       values ($1,(select id from identity_capability.accounts where uuid=$2),(select id from listing_capability.listings where uuid=$3),(select id from purchase_capability.purchases where uuid=$4),$5,$6)
       on conflict (uuid) do update set state=excluded.state,expires_at=excluded.expires_at,updated_at=now()`,
      [
        entitlement.id,
        entitlement.buyerId,
        entitlement.listingId,
        entitlement.purchaseId,
        entitlement.state,
        entitlement.expiresAt,
      ],
    );
  }
  private async find(
    where: string,
    values: readonly unknown[],
    forUpdate = false,
  ): Promise<Entitlement | null> {
    const row = (
      await this.sql.query<EntitlementRow>(
        `select e.uuid as id,
          (select uuid from identity_capability.accounts where id=e.buyer_id) as buyer_id,
          (select uuid from listing_capability.listings where id=e.listing_id) as listing_id,
          (select uuid from purchase_capability.purchases where id=e.purchase_id) as purchase_id,
          e.state,e.expires_at from entitlement_capability.entitlements e where ${where} limit 1${forUpdate ? " for update of e" : ""}`,
        values,
      )
    ).rows[0];
    return row
      ? Entitlement.restore(
          row.id,
          row.buyer_id,
          row.listing_id,
          row.purchase_id,
          row.state,
          row.expires_at,
        )
      : null;
  }
}
