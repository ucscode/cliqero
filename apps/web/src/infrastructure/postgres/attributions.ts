import type { SqlExecutor } from "./database";
import type {
  PurchaseAttribution,
  ReferralAttributionRepository,
  ReferralLinkRecord,
} from "@/modules/referral/attribution";

interface LinkRow {
  id: string;
  code: string;
  listing_id: string;
  referrer_account_id: string;
  state: "active" | "revoked";
  listing_title: string | null;
  created_at: Date;
}
export class PostgresReferralAttributionRepository implements ReferralAttributionRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async createOrGetLink(input: {
    id: string;
    code: string;
    listingId: string;
    referrerAccountId: string;
  }): Promise<ReferralLinkRecord> {
    const row = (
      await this.sql.query<LinkRow>(
        `with upserted as (insert into referral_capability.listing_referral_links(uuid,code,listing_id,referrer_account_id)
       values($1,$2,(select id from listing_capability.listings where uuid=$3),(select id from identity_capability.accounts where uuid=$4))
       on conflict(listing_id,referrer_account_id) do update set listing_id=excluded.listing_id
       returning *)
       select u.uuid as id,u.code,l.uuid as listing_id,a.uuid as referrer_account_id,u.state,u.created_at,l.title listing_title
       from upserted u join listing_capability.listings l on l.id=u.listing_id join identity_capability.accounts a on a.id=u.referrer_account_id`,
        [input.id, input.code, input.listingId, input.referrerAccountId],
      )
    ).rows[0];
    return mapLink(row);
  }
  async findActiveLinkByCode(code: string): Promise<ReferralLinkRecord | null> {
    const row = (
      await this.sql.query<LinkRow>(
        `select links.uuid as id,links.code,listings.uuid as listing_id,accounts.uuid as referrer_account_id,links.state,links.created_at,
          listings.title listing_title
         from referral_capability.listing_referral_links links
         left join listing_capability.listings listings on listings.id=links.listing_id
         left join identity_capability.accounts accounts on accounts.id=links.referrer_account_id
         where links.code=$1 and links.state='active'`,
        [code],
      )
    ).rows[0];
    return row ? mapLink(row) : null;
  }
  async findLinkById(id: string) {
    const row = (
      await this.sql.query<LinkRow>(
        `select links.uuid as id,links.code,listings.uuid as listing_id,accounts.uuid as referrer_account_id,links.state,links.created_at,
          listings.title listing_title
         from referral_capability.listing_referral_links links
         left join listing_capability.listings listings on listings.id=links.listing_id
         left join identity_capability.accounts accounts on accounts.id=links.referrer_account_id
         where links.uuid=$1`,
        [id],
      )
    ).rows[0];
    return row ? mapLink(row) : null;
  }
  async listLinks(referrerAccountId: string) {
    return (
      await this.sql.query<LinkRow>(
        `select links.uuid as id,links.code,listings.uuid as listing_id,accounts.uuid as referrer_account_id,links.state,links.created_at,
          listings.title listing_title
         from referral_capability.listing_referral_links links
         left join listing_capability.listings listings on listings.id=links.listing_id
         left join identity_capability.accounts accounts on accounts.id=links.referrer_account_id
         where links.referrer_account_id=(select id from identity_capability.accounts where uuid=$1) order by links.created_at desc,links.id`,
        [referrerAccountId],
      )
    ).rows.map(mapLink);
  }
  async revokeLink(id: string, referrerAccountId: string) {
    const result = await this.sql.query(
      `update referral_capability.listing_referral_links set state='revoked' where uuid=$1 and referrer_account_id=(select id from identity_capability.accounts where uuid=$2)`,
      [id, referrerAccountId],
    );
    if (result.rowCount !== 1) throw new Error("Referral link not found");
  }
  async createAttribution(input: {
    id: string;
    link: ReferralLinkRecord;
    tokenHash: Buffer;
    expiresAt: Date;
  }): Promise<void> {
    await this.sql.query(
      `insert into referral_capability.listing_attributions
      (uuid,referral_link_id,listing_id,referrer_account_id,token_hash,expires_at) values($1,(select id from referral_capability.listing_referral_links where uuid=$2),(select id from listing_capability.listings where uuid=$3),(select id from identity_capability.accounts where uuid=$4),$5,$6)`,
      [
        input.id,
        input.link.id,
        input.link.listingId,
        input.link.referrerAccountId,
        input.tokenHash,
        input.expiresAt,
      ],
    );
  }
  async resolveActive(tokenHash: Buffer, listingId: string): Promise<PurchaseAttribution | null> {
    const row = (
      await this.sql.query<{
        id: string;
        referral_link_id: string;
        referrer_account_id: string;
        listing_id: string;
      }>(
        `select a.uuid as id,(select uuid from referral_capability.listing_referral_links where id=a.referral_link_id) as referral_link_id,(select uuid from identity_capability.accounts where id=a.referrer_account_id) as referrer_account_id,(select uuid from listing_capability.listings where id=a.listing_id) as listing_id from referral_capability.listing_attributions a
       where a.token_hash=$1 and a.listing_id=(select id from listing_capability.listings where uuid=$2) and a.state='active' and a.expires_at>now()`,
        [tokenHash, listingId],
      )
    ).rows[0];
    return row
      ? {
          attributionId: row.id,
          referralLinkId: row.referral_link_id,
          referrerAccountId: row.referrer_account_id,
          listingId: row.listing_id,
        }
      : null;
  }
}
function mapLink(row: LinkRow): ReferralLinkRecord {
  return {
    id: row.id,
    code: row.code,
    listingId: row.listing_id,
    referrerAccountId: row.referrer_account_id,
    state: row.state,
    listingTitle: row.listing_title,
    createdAt: row.created_at,
  };
}
