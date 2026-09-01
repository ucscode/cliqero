import { describe, expect, it } from "vitest";
import type { QueryResult } from "pg";
import { OperatorOverviewService } from "./operator-overview";

function result<T extends object>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

describe("operator overview projection", () => {
  it("keeps catalogue-manager data limited to catalogue counts", async () => {
    const service = new OperatorOverviewService({
      query: async <T extends object>() =>
        result<T>([{ published: "3", draft: "2", archived: "1" }] as T[]),
    });
    await expect(service.get("catalogue_manager")).resolves.toEqual({
      role: "catalogue_manager",
      catalogue: { published: 3, draft: 2, archived: 1 },
    });
  });

  it("returns operational counts for operators without money aggregates", async () => {
    const responses = [
      result([{ published: "4", draft: "0", archived: "2" }]),
      result([{ total: "8" }]),
      result([{ total: "5" }]),
      result([{ requested: "1", approved: "3" }]),
    ];
    const service = new OperatorOverviewService({
      query: async <T extends object>() => responses.shift() as QueryResult<T>,
    });
    await expect(service.get("operator")).resolves.toEqual({
      role: "operator",
      catalogue: { published: 4, draft: 0, archived: 2 },
      users: { total: 8 },
      commerce: { purchases: 5 },
      withdrawals: { requested: 1, approved: 3 },
    });
  });
});
