import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import { PublicApplicationError } from "@/kernel/errors";

type Cursor = { createdAt: string; id: string };

function encodeCursor(createdAt: string | Date, id: string) {
  return Buffer.from(
    JSON.stringify({ created_at: new Date(createdAt).toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      created_at?: unknown;
      id?: unknown;
    };
    if (typeof parsed.created_at !== "string" || typeof parsed.id !== "string") throw new Error();
    const date = new Date(parsed.created_at);
    if (Number.isNaN(date.valueOf())) throw new Error();
    return { createdAt: date.toISOString(), id: parsed.id };
  } catch {
    throw new PublicApplicationError("Invalid pagination cursor", "invalid_cursor", 400);
  }
}

export type OperatorAccountSummary = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  country: string | null;
  createdAt: string;
  directReferralCount: number;
};

export type OperatorAccountDetail = OperatorAccountSummary & {
  deletedAt: string | null;
  parent: { id: string; username: string; displayName: string | null } | null;
  purchaseCount: number;
  latestParentReassignment: {
    actorId: string | null;
    previousParentId: string | null;
    parentId: string | null;
    occurredAt: string;
  } | null;
};

export class OperatorAccountService {
  constructor(private readonly sql: QueryExecutor) {}

  async list(input: { search?: string; cursor?: string; limit: number }) {
    const cursor = decodeCursor(input.cursor);
    const rawSearch = input.search?.trim() || "";
    const search = rawSearch ? rawSearch.replace(/[\\%_]/g, "\\$&") : null;
    const rows = (
      await this.sql.query<any>(
        `select a.uuid id,a.email,a.username,a.display_name,a.metadata->>'country' country,a.created_at,
          (select count(*)::int from referral_capability.account_referrals r where r.parent_account_id=a.id) direct_referral_count
         from identity_capability.account_profiles a
         where a.deleted_at is null
           and ($1::text is null or a.username ilike '%'||$1||'%' escape '\\' or a.email ilike '%'||$1||'%' escape '\\' or a.uuid::text=$1)
           and ($2::timestamptz is null or (a.created_at,a.id)<($2::timestamptz,(select id from identity_capability.accounts where uuid=$3)))
         order by a.created_at desc,a.id desc limit $4`,
        [search, cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1],
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => this.summary(row)),
      nextCursor:
        rows.length > input.limit
          ? encodeCursor(visible.at(-1).created_at, visible.at(-1).id)
          : null,
    };
  }

  async get(accountId: string): Promise<OperatorAccountDetail> {
    const row = (
      await this.sql.query<any>(
        `select a.uuid id,a.email,a.username,a.display_name,a.metadata->>'country' country,a.created_at,a.deleted_at,
          (select count(*)::int from referral_capability.account_referrals r where r.parent_account_id=a.id) direct_referral_count,
          p.uuid parent_id,p.username parent_username,p.display_name parent_display_name,
          (select count(*)::int from purchase_capability.purchases purchase where purchase.buyer_id=a.id) purchase_count
         from identity_capability.account_profiles a
         left join referral_capability.account_referrals ar on ar.child_account_id=a.id
         left join identity_capability.account_profiles p on p.id=ar.parent_account_id
         where a.uuid=$1`,
        [accountId],
      )
    ).rows[0];
    if (!row) throw new PublicApplicationError("Account not found", "not_found", 404);
    const audit = (
      await this.sql.query<any>(
        `select actor.uuid actor_id,previous_state->>'parent_account_id' previous_parent_id,
                new_state->>'parent_account_id' parent_id,occurred_at
           from kernel.audit_records audit left join identity_capability.accounts actor on actor.id=audit.actor_id
          where action='referral.parent_reassigned' and subject_type='account_referral' and subject_id=$1
          order by audit.occurred_at desc,audit.id desc limit 1`,
        [accountId],
      )
    ).rows[0];
    return {
      ...this.summary(row),
      deletedAt: row.deleted_at,
      parent: row.parent_id
        ? {
            id: row.parent_id,
            username: row.parent_username,
            displayName: row.parent_display_name ?? null,
          }
        : null,
      purchaseCount: Number(row.purchase_count ?? 0),
      latestParentReassignment: audit
        ? {
            actorId: audit.actor_id ?? null,
            previousParentId: audit.previous_parent_id ?? null,
            parentId: audit.parent_id ?? null,
            occurredAt: audit.occurred_at,
          }
        : null,
    };
  }

  private summary(row: any): OperatorAccountSummary {
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name ?? null,
      email: row.email,
      country: row.country ?? null,
      createdAt: row.created_at,
      directReferralCount: Number(row.direct_referral_count ?? 0),
    };
  }
}

/** Transactional persistence for the account tombstone lifecycle. */
export class PostgresOperatorAccountDeletionRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async lockForDeletion(accountId: string, actorId: string) {
    await this.sql.query(`select pg_advisory_xact_lock(hashtext('cliqero:system-root'))`);
    await this.sql.query(
      `select pg_advisory_xact_lock(hashtext('cliqero:referral-graph-mutation'))`,
    );
    const row = (
      await this.sql.query<{
        id: string;
        deleted_at: string | null;
        is_system_root: boolean;
        actor_is_system_root: boolean;
        system_root_count: number;
      }>(
        `select account.id::text,account.deleted_at,
          exists(select 1 from identity_capability.account_capabilities capability where capability.account_id=account.id and capability.capability='system.root') is_system_root,
          exists(select 1 from identity_capability.account_capabilities capability join identity_capability.accounts actor on actor.id=capability.account_id where actor.uuid=$2 and capability.capability='system.root') actor_is_system_root,
          (select count(*)::int from identity_capability.account_capabilities where capability='system.root') system_root_count
         from identity_capability.accounts account where account.uuid=$1 for update`,
        [accountId, actorId],
      )
    ).rows[0];
    return row
      ? {
          accountId: row.id,
          deletedAt: row.deleted_at,
          isSystemRoot: row.is_system_root,
          actorIsSystemRoot: row.actor_is_system_root,
          systemRootCount: row.system_root_count,
        }
      : null;
  }

  async detachChildren(accountId: string) {
    const result = await this.sql.query(
      `delete from referral_capability.account_referrals
        where parent_account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [accountId],
    );
    return result.rowCount ?? 0;
  }

  async archiveOwnedListings(accountId: string) {
    const result = await this.sql.query(
      `update listing_capability.listings set state='archived',updated_at=now()
       where seller_id=(select id from identity_capability.accounts where uuid=$1) and state<>'archived'`,
      [accountId],
    );
    return result.rowCount ?? 0;
  }

  async anonymizeWithdrawalDestinations(accountId: string) {
    const result = await this.sql.query(
      `update withdrawal_capability.destinations
          set name='Deleted destination',details='[]'::jsonb,status='archived',updated_at=now()
        where account_id=(select id from identity_capability.accounts where uuid=$1)
          and (name<>'Deleted destination' or details<>'[]'::jsonb or status<>'archived')`,
      [accountId],
    );
    return result.rowCount ?? 0;
  }

  async revokeReferralAttributions(accountId: string) {
    await this.sql.query(
      `update referral_capability.account_attributions set state='revoked'
       where referrer_account_id=(select id from identity_capability.accounts where uuid=$1) and state='active'`,
      [accountId],
    );
    await this.sql.query(
      `update referral_capability.listing_attributions set state='revoked'
       where referrer_account_id=(select id from identity_capability.accounts where uuid=$1) and state='active'`,
      [accountId],
    );
  }

  async revokeApiKeysAndSessions(accountId: string) {
    await this.sql.query(
      `delete from identity_capability.api_keys
       where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [accountId],
    );
    await this.sql.query(
      `update identity_capability.sessions set state='revoked'
       where account_id=(select id from identity_capability.accounts where uuid=$1) and state='active'`,
      [accountId],
    );
    await this.sql.query(
      `delete from access_capability.integrations
       where owner_id=(select id from identity_capability.accounts where uuid=$1)`,
      [accountId],
    );
  }

  async removeCapabilities(accountId: string) {
    await this.sql.query(
      `delete from identity_capability.account_capabilities
       where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [accountId],
    );
  }

  async tombstone(accountId: string) {
    await this.sql.query(
      `update identity_capability.accounts
          set username='del-'||substr(replace(uuid::text,'-',''),1,28),
              metadata='{}'::jsonb,deleted_at=now(),updated_at=now()
        where uuid=$1 and deleted_at is null`,
      [accountId],
    );
  }

  async removeHierarchyEdge(accountId: string) {
    await this.sql.query(
      `delete from referral_capability.account_referrals
       where child_account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [accountId],
    );
  }
}
