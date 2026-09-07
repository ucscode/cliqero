import type { SqlExecutor } from "./database";
import type {
  PurchaseAttribution,
  ReferralAttributionRepository,
} from "@/modules/referral/attribution";
export class PostgresReferralAttributionRepository implements ReferralAttributionRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async createAttribution(input: {
    id: string;
    listingId: string;
    referrerAccountId: string;
    tokenHash: Buffer;
    expiresAt: Date;
  }): Promise<void> {
    await this.sql.query(
      `insert into referral_capability.listing_attributions
      (uuid,listing_id,referrer_account_id,token_hash,expires_at) values($1,(select id from listing_capability.listings where uuid=$2),(select id from identity_capability.accounts where uuid=$3),$4,$5)`,
      [input.id, input.listingId, input.referrerAccountId, input.tokenHash, input.expiresAt],
    );
  }
  async resolveActive(tokenHash: Buffer, listingId: string): Promise<PurchaseAttribution | null> {
    const row = (
      await this.sql.query<{
        id: string;
        referrer_account_id: string;
        listing_id: string;
      }>(
        `select a.uuid as id,(select uuid from identity_capability.accounts where id=a.referrer_account_id) as referrer_account_id,(select uuid from listing_capability.listings where id=a.listing_id) as listing_id from referral_capability.listing_attributions a
       where a.token_hash=$1 and a.listing_id=(select id from listing_capability.listings where uuid=$2) and a.state='active' and a.expires_at>now()`,
        [tokenHash, listingId],
      )
    ).rows[0];
    return row
      ? {
          attributionId: row.id,
          referrerAccountId: row.referrer_account_id,
          listingId: row.listing_id,
        }
      : null;
  }
}
