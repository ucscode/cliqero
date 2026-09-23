import { describe, expect, it, vi } from "vitest";
import { PostgresAccountRepository } from "@/infrastructure/postgres/identity/accounts";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";

function repositoryFor(row?: {
  onboarding_state: string;
  id: string | null;
  username: string | null;
  country: string | null;
}) {
  const query = vi.fn(async () => ({
    rows: row ? [row] : [],
    rowCount: row ? 1 : 0,
  })) as unknown as QueryExecutor["query"];
  return { query, repository: new PostgresAccountRepository({ query }) };
}

describe("PostgresAccountRepository auth identity resolution", () => {
  it.each([
    ["missing", undefined, { state: "missing", account: null }],
    [
      "incomplete",
      { onboarding_state: "incomplete", id: null, username: null, country: null },
      { state: "incomplete", account: null },
    ],
    [
      "complete",
      {
        onboarding_state: "complete",
        id: "550e8400-e29b-41d4-a716-446655440000",
        username: "buyer",
        country: "NG",
      },
      {
        state: "complete",
        account: {
          id: "550e8400-e29b-41d4-a716-446655440000",
          username: "buyer",
          country: "NG",
        },
      },
    ],
  ] as const)("resolves a %s identity", async (_name, row, expected) => {
    const { query, repository } = repositoryFor(row);
    const result = await repository.resolveAuthIdentity("auth-user");

    expect(result).toEqual(expected);
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("left join"), ["auth-user"]);
  });

  it.each([
    ["complete without a joined account", { onboarding_state: "complete", id: null }],
    ["incomplete with a joined account", { onboarding_state: "incomplete", id: "account-id" }],
  ] as const)("treats %s as missing", async (_name, row) => {
    const { repository } = repositoryFor({
      ...row,
      username: row.id ? "buyer" : null,
      country: "NG",
    });

    await expect(repository.resolveAuthIdentity("auth-user")).resolves.toEqual({
      state: "missing",
      account: null,
    });
  });
});
