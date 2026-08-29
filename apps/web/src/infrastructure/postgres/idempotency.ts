import type { SqlExecutor } from "./database";

export interface IdempotencyResult { resultReference: string | null; response: unknown; }

export class PostgresIdempotencyRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async begin(scope: string, key: string): Promise<boolean> {
    const result = await this.sql.query(
      `insert into kernel.idempotency_records (scope, idempotency_key, state)
       values ($1, $2, 'processing') on conflict (scope, idempotency_key) do nothing`, [scope, key],
    );
    return result.rowCount === 1;
  }

  async complete(scope: string, key: string, resultReference: string, response: unknown = null): Promise<void> {
    await this.sql.query(
      `update kernel.idempotency_records
       set state = 'completed', result_reference = $3, response = $4::jsonb, updated_at = now()
       where scope = $1 and idempotency_key = $2`, [scope, key, resultReference, JSON.stringify(response)],
    );
  }
  async fail(scope:string,key:string,error:string):Promise<void>{await this.sql.query(`update kernel.idempotency_records set state='failed',response=$3::jsonb,updated_at=now() where scope=$1 and idempotency_key=$2`,[scope,key,JSON.stringify({error:error.slice(0,4000)})]);}

  async findCompleted(scope: string, key: string): Promise<IdempotencyResult | null> {
    const result = await this.sql.query<{ result_reference: string | null; response: unknown }>(
      `select result_reference, response from kernel.idempotency_records
       where scope = $1 and idempotency_key = $2 and state = 'completed'`, [scope, key],
    );
    const row = result.rows[0];
    return row ? { resultReference: row.result_reference, response: row.response } : null;
  }
}
