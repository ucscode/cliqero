import { describe, expect, it } from "vitest";
import { OperatorTreasuryService } from "./operator-treasury";

describe("operator treasury read model", () => {
  it("projects exact summary and safe source/actor metadata", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const sql = {
      query: async (statement: string, values?: unknown[]) => {
        queries.push({ sql: statement, values });
        if (statement.includes("credits")) return { rows: [{ credits: "1250", debits: "250" }] };
        return {
          rows: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              direction: "credit",
              amount_minor: "1000",
              title: "Platform allocation",
              note: "Distribution",
              source_kind: "distribution",
              source_id: "00000000-0000-4000-8000-000000000002",
              created_at: "2026-01-01T00:00:00.000Z",
              actor_id: null,
              actor_handle: null,
              actor_email: null,
            },
          ],
        };
      },
    } as any;
    const service = new OperatorTreasuryService(sql);
    expect(await service.summary()).toEqual({
      balanceMinor: "1000",
      creditsMinor: "1250",
      debitsMinor: "250",
      currency: "USD",
    });
    const page = await service.list({ limit: 10, source: "automatic" });
    expect(page.items[0]).toMatchObject({
      amountMinor: "1000",
      source: { kind: "distribution", id: "00000000-0000-4000-8000-000000000002" },
      actor: null,
    });
    expect(
      queries.some((query) => query.sql.includes("order by e.created_at desc,e.id desc")),
    ).toBe(true);
  });

  it("rejects malformed opaque cursors", async () => {
    const service = new OperatorTreasuryService({ query: async () => ({ rows: [] }) } as any);
    await expect(service.list({ limit: 10, cursor: "not-a-cursor" })).rejects.toThrow(
      "Invalid pagination cursor",
    );
  });
});
