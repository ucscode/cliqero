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
    await expect(service.get(["catalogue.manage"])).resolves.toEqual({
      capabilities: ["catalogue.manage"],
      catalogue: { published: 3, draft: 2, archived: 1 },
    });
  });

  it("does not query catalogue data for an unrelated operator capability", async () => {
    const service = new OperatorOverviewService({
      query: async () => {
        throw new Error("catalogue query should not run");
      },
    });
    await expect(service.get(["content.manage"])).resolves.toEqual({
      capabilities: ["content.manage"],
      catalogue: { published: 0, draft: 0, archived: 0 },
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
    await expect(service.get(["system.root"])).resolves.toEqual({
      capabilities: ["system.root"],
      catalogue: { published: 4, draft: 0, archived: 2 },
      users: { total: 8 },
      commerce: { purchases: 5 },
      withdrawals: { requested: 1, approved: 3 },
    });
  });
});
