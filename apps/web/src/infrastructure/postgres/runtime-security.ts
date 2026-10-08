import { Pool } from "pg";

const applicationSchemas = [
  "access_capability",
  "better_auth",
  "checkout_capability",
  "entitlement_capability",
  "funding_capability",
  "identity_capability",
  "kernel",
  "ledger_capability",
  "listing_capability",
  "money_capability",
  "payment_capability",
  "purchase_capability",
  "referral_capability",
  "treasury_capability",
  "wallet_capability",
  "withdrawal_capability",
];

const insecurePasswords = new Set([
  "cliqero-local",
  "cliqero-runtime-local",
  "password",
  "changeme",
  "development",
]);

export function assertProductionDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): void {
  if (environment.NODE_ENV !== "production") return;
  const value = environment.DATABASE_URL?.trim();
  const bootstrapRole = environment.POSTGRES_USER?.trim();
  if (!value || !bootstrapRole)
    throw new Error("Production requires DATABASE_URL and POSTGRES_USER.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Production DATABASE_URL must be a valid PostgreSQL URL.");
  }
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!/^postgres(ql)?:$/.test(url.protocol) || !username || !password)
    throw new Error("Production DATABASE_URL must include restricted PostgreSQL credentials.");
  if (username === bootstrapRole || ["postgres", "cliqero"].includes(username.toLowerCase()))
    throw new Error("Production DATABASE_URL must not use the bootstrap or a default role.");
  if (
    password.length < 32 ||
    insecurePasswords.has(password.toLowerCase()) ||
    password.toLowerCase().includes("cliqero")
  )
    throw new Error("Production DATABASE_URL contains an insecure runtime credential.");
}

export async function verifyProductionDatabaseRole(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (environment.NODE_ENV !== "production") return;
  assertProductionDatabaseUrl(environment);
  const pool = new Pool({
    connectionString: environment.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const result = await pool.query<{
      superuser: boolean;
      createdb: boolean;
      createrole: boolean;
      replication: boolean;
      bypassrls: boolean;
      inherit: boolean;
      memberships: boolean;
      owns_schema: boolean;
      owns_relations: boolean;
      database_create: boolean;
      public_create: boolean;
      can_set_replication_role: boolean;
      unexpected_schema_access: boolean;
      append_only_triggers: number;
    }>(
      `select role_row.rolsuper as superuser,
              role_row.rolcreatedb as createdb,
              role_row.rolcreaterole as createrole,
              role_row.rolreplication as replication,
              role_row.rolbypassrls as bypassrls,
              role_row.rolinherit as inherit,
              exists (select 1 from pg_auth_members membership where membership.member = role_row.oid) as memberships,
              exists (select 1 from pg_namespace n where n.nspowner = role_row.oid and n.nspname = any($1::text[])) as owns_schema,
              exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relowner=role_row.oid and n.nspname = any($1::text[])) as owns_relations,
              has_database_privilege(current_user, current_database(), 'CREATE') as database_create,
              has_schema_privilege(current_user, 'public', 'CREATE') as public_create,
              has_parameter_privilege(current_user, 'session_replication_role', 'SET') as can_set_replication_role,
              exists (
                select 1 from pg_namespace n
                 where n.nspname <> 'information_schema'
                   and n.nspname not like 'pg\\_%' escape '\\'
                   and not (n.nspname = any($1::text[]))
                   and (has_schema_privilege(current_user,n.oid,'USAGE') or has_schema_privilege(current_user,n.oid,'CREATE'))
              ) as unexpected_schema_access,
              (select count(*)::int from pg_trigger t
                join pg_class c on c.oid=t.tgrelid
                join pg_namespace n on n.oid=c.relnamespace
               where not t.tgisinternal and t.tgenabled in ('O','A') and (
                 (n.nspname='ledger_capability' and c.relname='entries' and t.tgname='ledger_entries_append_only') or
                 (n.nspname='ledger_capability' and c.relname='account_debt_entries' and t.tgname='account_debt_entries_append_only') or
                 (n.nspname='treasury_capability' and c.relname='entries' and t.tgname='treasury_entries_append_only') or
                 (n.nspname='wallet_capability' and c.relname='credits' and t.tgname='wallet_credits_append_only') or
                 (n.nspname='wallet_capability' and c.relname='debits' and t.tgname='wallet_debits_append_only')
               )) as append_only_triggers
         from pg_roles role_row where role_row.rolname=current_user`,
      [applicationSchemas],
    );
    const role = result.rows[0];
    if (
      !role ||
      role.superuser ||
      role.createdb ||
      role.createrole ||
      role.replication ||
      role.bypassrls ||
      role.inherit ||
      role.memberships ||
      role.owns_schema ||
      role.owns_relations ||
      role.database_create ||
      role.public_create ||
      role.can_set_replication_role ||
      role.unexpected_schema_access ||
      role.append_only_triggers !== 5
    )
      throw new Error(
        "Production PostgreSQL runtime role failed privilege and financial-trigger verification.",
      );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Production PostgreSQL runtime role"))
      throw error;
    throw new Error("Production PostgreSQL runtime role verification failed.");
  } finally {
    await pool.end();
  }
}
