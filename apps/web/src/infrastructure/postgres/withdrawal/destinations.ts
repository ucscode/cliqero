import type {
  DestinationField,
  SavedWithdrawalDestination,
  WithdrawalDestinationRepository,
} from "@/modules/withdrawal/withdrawal";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";

type DestinationRow = {
  id: string;
  account_id: string;
  method_key: string;
  name: string;
  details: DestinationField[];
  status: "active" | "archived";
  created_at: Date;
  updated_at: Date;
};

export class PostgresWithdrawalDestinationRepository implements WithdrawalDestinationRepository {
  constructor(private readonly sql: QueryExecutor) {}

  findById(id: string) {
    return this.find("d.uuid=$1", [id]);
  }

  listForAccount(accountId: string) {
    return this.list("d.account_id=(select id from identity_capability.accounts where uuid=$1)", [
      accountId,
    ]);
  }

  async create(destination: SavedWithdrawalDestination) {
    await this.sql.query(
      `insert into withdrawal_capability.destinations
        (uuid,account_id,method_key,name,details,status,created_at,updated_at)
       values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5::jsonb,$6,$7,$8)`,
      [
        destination.id,
        destination.accountId,
        destination.method,
        destination.name,
        JSON.stringify(destination.fields),
        destination.status,
        destination.createdAt,
        destination.updatedAt,
      ],
    );
  }

  async update(destination: SavedWithdrawalDestination) {
    const result = await this.sql.query(
      `update withdrawal_capability.destinations
          set name=$3,details=$4::jsonb,status=$5,updated_at=$6
        where uuid=$1 and account_id=(select id from identity_capability.accounts where uuid=$2)`,
      [
        destination.id,
        destination.accountId,
        destination.name,
        JSON.stringify(destination.fields),
        destination.status,
        destination.updatedAt,
      ],
    );
    if (result.rowCount !== 1) throw new Error("Withdrawal destination not found");
  }

  private async find(where: string, values: readonly unknown[]) {
    const row = (await this.sql.query<DestinationRow>(`${this.select()} where ${where}`, values))
      .rows[0];
    return row ? this.map(row) : null;
  }

  private async list(where: string, values: readonly unknown[]) {
    const rows = (
      await this.sql.query<DestinationRow>(
        `${this.select()} where ${where} and d.status='active' order by d.created_at desc,d.id desc`,
        values,
      )
    ).rows;
    return rows.map((row) => this.map(row));
  }

  private select() {
    return `select d.uuid as id,
      (select uuid from identity_capability.accounts where id=d.account_id) as account_id,
      d.method_key,d.name,d.details,d.status,d.created_at,d.updated_at
      from withdrawal_capability.destinations d`;
  }

  private map(row: DestinationRow): SavedWithdrawalDestination {
    return {
      id: row.id,
      accountId: row.account_id,
      method: row.method_key,
      name: row.name,
      fields: row.details,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
