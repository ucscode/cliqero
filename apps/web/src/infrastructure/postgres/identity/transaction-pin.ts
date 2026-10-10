import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type {
  TransactionPinAttempt,
  TransactionPinRepository,
} from "@/modules/identity/transaction-pin";

const maximumAttempts = 5;
const lockDurationMs = 15 * 60 * 1000;

interface CredentialRow {
  pin_hash: string;
  failed_attempts: number;
  locked_until: Date | null;
}

export class PostgresTransactionPinRepository implements TransactionPinRepository {
  constructor(
    private readonly sql: QueryExecutor,
    private readonly uow: UnitOfWork,
  ) {}

  async exists(accountId: string) {
    const result = await this.sql.query(
      "select 1 from identity_capability.transaction_pin_credentials where account_id=(select id from identity_capability.accounts where uuid=$1)",
      [accountId],
    );
    return result.rowCount === 1;
  }

  async set(accountId: string, hash: string, onlyIfMissing = false) {
    const sql = onlyIfMissing
      ? `insert into identity_capability.transaction_pin_credentials(account_id,pin_hash)
         select id,$2 from identity_capability.accounts where uuid=$1 and deleted_at is null
         on conflict(account_id) do nothing`
      : `insert into identity_capability.transaction_pin_credentials(account_id,pin_hash)
         select id,$2 from identity_capability.accounts where uuid=$1 and deleted_at is null
         on conflict(account_id) do update set pin_hash=excluded.pin_hash,
           failed_attempts=0,locked_until=null,updated_at=now()`;
    return this.uow.transaction(async () => {
      const result = await this.sql.query(sql, [accountId, hash]);
      return result.rowCount === 1;
    });
  }

  async verify(
    accountId: string,
    pin: string,
    verifyHash: (pin: string, hash: string) => Promise<boolean>,
  ): Promise<TransactionPinAttempt> {
    return this.uow.transaction(async () => {
      const row = (
        await this.sql.query<CredentialRow>(
          `select pin_hash,failed_attempts,locked_until
             from identity_capability.transaction_pin_credentials
            where account_id=(select id from identity_capability.accounts where uuid=$1)
            for update`,
          [accountId],
        )
      ).rows[0];
      if (!row) return "missing";
      const now = new Date();
      if (row.locked_until && row.locked_until > now) return "locked";
      if (row.locked_until) {
        await this.sql.query(
          `update identity_capability.transaction_pin_credentials
              set failed_attempts=0,locked_until=null,updated_at=now()
            where account_id=(select id from identity_capability.accounts where uuid=$1)`,
          [accountId],
        );
      }
      if (await verifyHash(pin, row.pin_hash)) {
        await this.sql.query(
          `update identity_capability.transaction_pin_credentials
              set failed_attempts=0,locked_until=null,updated_at=now()
            where account_id=(select id from identity_capability.accounts where uuid=$1)`,
          [accountId],
        );
        return "valid";
      }
      const failures = row.locked_until ? 1 : row.failed_attempts + 1;
      const locked = failures >= maximumAttempts;
      await this.sql.query(
        `update identity_capability.transaction_pin_credentials
            set failed_attempts=$2,locked_until=$3,updated_at=now()
          where account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [
          accountId,
          locked ? 0 : failures,
          locked ? new Date(now.getTime() + lockDurationMs) : null,
        ],
      );
      return locked ? "locked" : "invalid";
    });
  }

  async change(
    accountId: string,
    currentPin: string,
    nextHash: string,
    verifyHash: (pin: string, hash: string) => Promise<boolean>,
  ): Promise<TransactionPinAttempt> {
    return this.uow.transaction(async () => {
      const row = (
        await this.sql.query<CredentialRow>(
          `select pin_hash,failed_attempts,locked_until
             from identity_capability.transaction_pin_credentials
            where account_id=(select id from identity_capability.accounts where uuid=$1)
            for update`,
          [accountId],
        )
      ).rows[0];
      if (!row) return "missing";
      const now = new Date();
      if (row.locked_until && row.locked_until > now) return "locked";
      const valid = await verifyHash(currentPin, row.pin_hash);
      if (valid) {
        await this.sql.query(
          `update identity_capability.transaction_pin_credentials
              set pin_hash=$2,failed_attempts=0,locked_until=null,updated_at=now()
            where account_id=(select id from identity_capability.accounts where uuid=$1)`,
          [accountId, nextHash],
        );
        return "valid";
      }
      const failures = row.locked_until ? 1 : row.failed_attempts + 1;
      const locked = failures >= maximumAttempts;
      await this.sql.query(
        `update identity_capability.transaction_pin_credentials
            set failed_attempts=$2,locked_until=$3,updated_at=now()
          where account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [
          accountId,
          locked ? 0 : failures,
          locked ? new Date(now.getTime() + lockDurationMs) : null,
        ],
      );
      return locked ? "locked" : "invalid";
    });
  }
}
