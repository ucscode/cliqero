import { describe, expect, it, vi } from "vitest";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import { PostgresHierarchyReader } from "@/infrastructure/postgres/hierarchy/service";

describe("Postgres hierarchy username search", () => {
  it("uses a parameterized username prefix and server-side descendant scope for customers", async () => {
    const calls: Array<[string, readonly unknown[] | undefined]> = [];
    const query = vi.fn(async (statement: string, values?: readonly unknown[]) => {
      calls.push([statement, values]);
      return {
        rows: [{ id: "account-id", username: "alpha_one", display_name: "Alpha One" }],
        rowCount: 1,
      };
    });
    const reader = new PostgresHierarchyReader({ query } as unknown as QueryExecutor);

    await expect(reader.search("Alpha", "requester-id", 10)).resolves.toEqual([
      { id: "account-id", username: "alpha_one", displayName: "Alpha One" },
    ]);
    const [statement, values] = calls[0]!;
    expect(statement).toContain("candidate.username like $1||'%' escape E'\\\\'");
    expect(statement).toContain("with recursive requester(id) as materialized");
    expect(statement).toContain("with recursive ancestors(id,path)");
    expect(statement).toContain("referral.child_account_id=ancestors.id");
    expect(statement).toContain("order by candidate.username\n           limit $2");
    expect(statement).not.toContain("with recursive tree(id,path)");
    expect(statement).toContain("join identity_capability.account_profiles profile");
    expect(statement).not.toContain("a.email");
    expect(values).toEqual(["alpha", 10, "requester-id"]);

    await reader.search("Alpha_%", "requester-id", 10);
    expect(calls[1]?.[1]).toEqual(["alpha\\_\\%", 10, "requester-id"]);
  });

  it("preserves broader operator matching separately", async () => {
    const calls: Array<[string, readonly unknown[] | undefined]> = [];
    const query = vi.fn(async (statement: string, values?: readonly unknown[]) => {
      calls.push([statement, values]);
      return { rows: [], rowCount: 0 };
    });
    const reader = new PostgresHierarchyReader({ query } as unknown as QueryExecutor);

    await reader.search("operator", null, 25);
    expect(calls[0]?.[0]).toContain("a.email ilike '%'||$1||'%'");
    expect(calls[0]?.[1]).toEqual(["operator", 25]);
  });
});
