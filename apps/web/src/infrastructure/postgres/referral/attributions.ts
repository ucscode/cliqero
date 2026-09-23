import type { QueryExecutor } from "../shared/database";
import type {
  AccountReferralAttribution,
  AccountReferralAttributionRepository,
  PurchaseAttribution,
  ReferralAttributionRepository,
} from "@/modules/referral/attribution";
export class PostgresReferralAttributionRepository
  implements ReferralAttributionRepository, AccountReferralAttributionRepository
{
  constructor(private readonly sql: QueryExecutor) {}
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

  async createAccountAttribution(input: {
    id: string;
    referrerAccountId: string;
    tokenHash: Buffer;
    expiresAt: Date;
  }): Promise<void> {
    await this.sql.query(
      `insert into referral_capability.account_attributions
       (uuid,referrer_account_id,token_hash,expires_at)
       values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4)`,
      [input.id, input.referrerAccountId, input.tokenHash, input.expiresAt],
    );
  }

  async resolveAccountAttribution(tokenHash: Buffer): Promise<AccountReferralAttribution | null> {
    const row = (
      await this.sql.query<{ referrer_account_id: string }>(
        `select account.uuid as referrer_account_id
           from referral_capability.account_attributions attribution
           join identity_capability.accounts account on account.id=attribution.referrer_account_id
          where attribution.token_hash=$1
            and attribution.state='active'
            and attribution.expires_at>now()`,
        [tokenHash],
      )
    ).rows[0];
    return row ? { referrerAccountId: row.referrer_account_id } : null;
  }

  async claimAccountAttribution(
    tokenHash: Buffer,
    childAccountId: string,
  ): Promise<AccountReferralAttribution | null> {
    const row = (
      await this.sql.query<{ referrer_account_id: string }>(
        `update referral_capability.account_attributions attribution
            set state='consumed',consumed_at=now(),consumed_by_account_id=(select id from identity_capability.accounts where uuid=$2)
          from identity_capability.accounts referrer
         where attribution.referrer_account_id=referrer.id
           and attribution.token_hash=$1
           and attribution.state='active'
           and attribution.expires_at>now()
         returning referrer.uuid as referrer_account_id`,
        [tokenHash, childAccountId],
      )
    ).rows[0];
    return row ? { referrerAccountId: row.referrer_account_id } : null;
  }

  async revokeAccountAttribution(tokenHash: Buffer): Promise<void> {
    await this.sql.query(
      `update referral_capability.account_attributions
          set state='revoked'
        where token_hash=$1 and state='active'`,
      [tokenHash],
    );
  }
}
