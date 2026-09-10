import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { BankTransferEvidenceService } from "./bank-transfer-evidence";

const fundingId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

describe("bank-transfer evidence", () => {
  it("requires meaningful evidence and moves owned bank funding to review", async () => {
    const statements: string[] = [];
    const service = new BankTransferEvidenceService({
      query: async <T extends object>(sql: string) => {
        statements.push(sql);
        if (sql.includes("returning uuid"))
          return result<T>([
            { id: "00000000-0000-4000-8000-000000000003", created_at: new Date() },
          ] as T[]);
        if (
          sql.includes("from funding_capability.funding_transactions") &&
          !sql.includes("funding_evidence")
        )
          return result<T>([
            {
              id: fundingId,
              account_id: 7,
              provider_name: "bank_transfer",
              state: "awaiting_payment",
            },
          ] as T[]);
        if (sql.includes("select uuid from identity_capability.accounts"))
          return result<T>([{ uuid: accountId }] as T[]);
        if (sql.includes("funding_evidence") && sql.includes("select")) return result<T>([]);
        return result<T>([]) as QueryResult<T>;
      },
    });
    await expect(
      service.submit(accountId, fundingId, { customerNote: "Transfer sent" }),
    ).resolves.toMatchObject({ state: "verification_pending", customerNote: "Transfer sent" });
    await expect(service.submit(accountId, fundingId, {})).rejects.toThrow(
      "At least one transfer evidence item",
    );
    expect(
      statements.some((sql) => sql.includes("update funding_capability.funding_transactions")),
    ).toBe(true);
    expect(statements.some((sql) => sql.includes("insert into kernel.audit_records"))).toBe(true);
  });

  it("does not permit evidence on another account's funding", async () => {
    const service = new BankTransferEvidenceService({
      query: async <T extends object>(sql: string) =>
        sql.includes("from funding_capability.funding_transactions") &&
        !sql.includes("funding_evidence")
          ? result<T>([
              {
                id: fundingId,
                account_id: 7,
                provider_name: "bank_transfer",
                state: "awaiting_payment",
              },
            ] as T[])
          : (result<T>([]) as QueryResult<T>),
    });
    await expect(
      service.submit("other-account", fundingId, { customerNote: "claim" }),
    ).rejects.toThrow("Funding not found");
  });
});
