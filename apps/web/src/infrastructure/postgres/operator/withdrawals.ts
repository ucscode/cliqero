import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";

type WithdrawalState =
  | "requested"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed"
  | "failed";
type Cursor = { createdAt: string; id: string };
type DestinationField = {
  name: string;
  label: string;
  value: string;
  displayValue?: string;
  type: "text" | "select" | "textarea" | "fixed";
  copyable: boolean;
};

function encodeCursor(createdAt: string | Date, id: string) {
  return Buffer.from(
    JSON.stringify({ created_at: new Date(createdAt).toISOString(), id }),
    "utf8",
  ).toString("base64url");
}
function decodeCursor(value?: string): Cursor | null {
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
    throw new Error("Invalid pagination cursor");
  }
}
export type OperatorWithdrawal = {
  id: string;
  account: { id: string; username: string; email: string | null };
  amountMinor: string;
  currency: string;
  destination: { method: string; methodName: string; name: string };
  state: WithdrawalState;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  reservation: {
    amountMinor: string;
    currency: string;
    state: "reserved" | "released" | "completed";
  } | null;
  externalReference: string | null;
  completionNote: string | null;
  completedBy: string | null;
  completedAt: string | null;
  attention: "review" | "action_required" | "none";
};

export type OperatorWithdrawalDetail = OperatorWithdrawal & {
  destination: OperatorWithdrawal["destination"] & {
    savedDestinationId: string;
    fields: DestinationField[];
  };
};

function map(row: any, detail = false): OperatorWithdrawal {
  const attention =
    row.state === "requested" ? "review" : row.state === "approved" ? "action_required" : "none";
  return {
    id: row.id,
    account: { id: row.account_id, username: row.username, email: row.email },
    amountMinor: String(row.amount_minor),
    currency: row.currency,
    destination: {
      method: row.destination_method,
      methodName: row.destination_method_name,
      name: row.destination_name,
      ...(detail
        ? { savedDestinationId: row.saved_destination_id, fields: row.destination_details }
        : {}),
    },
    state: row.state,
    reason: row.reason ?? null,
    externalReference: row.external_reference ?? null,
    completionNote: row.completion_note ?? null,
    completedBy: row.completed_by ?? null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reservation: row.reservation_id
      ? {
          amountMinor: String(row.reservation_amount_minor),
          currency: row.reservation_currency,
          state: row.reservation_state,
        }
      : null,
    attention,
  };
}

const projection = `
  select w.uuid as id,a.uuid as account_id,a.username,a.email,w.amount_minor,w.currency,w.saved_destination_id,w.destination_method,w.destination_method_name,w.destination_name,w.destination_details,w.state,w.reason,w.external_reference,w.completion_note,(select uuid from identity_capability.accounts where id=w.completed_by) completed_by,w.completed_at,w.created_at,w.updated_at,
    r.uuid reservation_id,r.amount_minor reservation_amount_minor,r.currency reservation_currency,
    (select e.kind from ledger_capability.withdrawal_reservation_events e where e.reservation_id=r.id order by e.created_at desc,e.id desc limit 1) reservation_state
   from withdrawal_capability.withdrawals w
   join identity_capability.account_profiles a on a.id=w.account_id
   left join ledger_capability.withdrawal_reservations r on r.withdrawal_id=w.id
`;

export class OperatorWithdrawalService {
  constructor(private readonly sql: QueryExecutor) {}
  async list(input: {
    search?: string;
    state?: WithdrawalState;
    attention?: OperatorWithdrawal["attention"];
    cursor?: string;
    limit: number;
  }) {
    const cursor = decodeCursor(input.cursor);
    const raw = input.search?.trim() || "";
    const search = raw ? raw.replace(/[\\%_]/g, "\\$&") : null;
    const values: unknown[] = [
      search,
      input.state ?? null,
      input.attention ?? null,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      input.limit + 1,
    ];
    const rows = (
      await this.sql.query<any>(
        `select * from (${projection}) q
          where ($1::text is null or q.id::text=$1 or q.destination_name ilike '%'||$1||'%' escape '\\' or q.destination_details::text ilike '%'||$1||'%' escape '\\' or q.external_reference ilike '%'||$1||'%' escape '\\' or q.username ilike '%'||$1||'%' escape '\\' or q.email ilike '%'||$1||'%' escape '\\')
            and ($2::text is null or q.state=$2)
            and ($3::text is null or case when q.state='requested' then 'review' when q.state='approved' then 'action_required' else 'none' end=$3::text)
            and ($4::timestamptz is null or (q.created_at,(select id from withdrawal_capability.withdrawals where uuid=q.id))<($4::timestamptz,(select id from withdrawal_capability.withdrawals where uuid=$5)))
          order by q.created_at desc,q.id desc limit $6`,
        values,
      )
    ).rows;
    const items = rows
      .slice(0, input.limit)
      .map((row) => map(row))
      .filter((item) => !input.attention || item.attention === input.attention);
    return {
      items,
      nextCursor:
        rows.length > input.limit && items.length
          ? encodeCursor(rows[input.limit - 1].created_at, rows[input.limit - 1].id)
          : null,
    };
  }
  async get(id: string): Promise<OperatorWithdrawalDetail> {
    const row = (await this.sql.query<any>(`${projection} where w.uuid=$1`, [id])).rows[0];
    if (!row) throw new Error("Withdrawal not found");
    return map(row, true) as OperatorWithdrawalDetail;
  }
}
