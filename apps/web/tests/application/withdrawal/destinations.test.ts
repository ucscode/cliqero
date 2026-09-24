import { describe, expect, it, vi } from "vitest";
import { WithdrawalDestinationService } from "@/application/withdrawal/destinations";
import { Account } from "@/modules/identity/account";
import { WithdrawalMethodRegistry } from "@/modules/withdrawal/methods/registry";
import type { SavedWithdrawalDestination } from "@/modules/withdrawal/withdrawal";

const bankMethod = {
  id: "bank_ng",
  enabled: true,
  display_name: "Bank account",
  description: "Nigerian bank account",
  filters: { countries: ["NG"] },
  fields: [
    {
      name: "bank",
      label: "Bank",
      type: "text",
      required: true,
      copyable: true,
    },
    {
      name: "account",
      label: "Account number",
      type: "text",
      required: true,
      regex: "^[0-9]{10}$",
      copyable: true,
    },
    {
      name: "network",
      label: "Network",
      type: "fixed",
      value: "TRC20",
      copyable: true,
    },
  ],
};

function fixture(configuration: unknown = { methods: [bankMethod] }) {
  const rows = new Map<string, SavedWithdrawalDestination>();
  const destinationRepository = {
    findById: vi.fn(async (id: string) => rows.get(id) ?? null),
    listForAccount: vi.fn(async (accountId: string) =>
      [...rows.values()].filter((row) => row.accountId === accountId && row.status === "active"),
    ),
    create: vi.fn(async (row: SavedWithdrawalDestination) => {
      rows.set(row.id, row);
    }),
    update: vi.fn(async (row: SavedWithdrawalDestination) => {
      rows.set(row.id, row);
    }),
  };
  const accounts = {
    exists: async (id: string) => id === "owner" || id === "other",
    findById: async (id: string) =>
      id === "owner"
        ? new Account("owner", "owner", "NG")
        : id === "other"
          ? new Account("other", "other", "US")
          : null,
  };
  const service = new WithdrawalDestinationService(
    destinationRepository,
    accounts,
    new WithdrawalMethodRegistry(configuration),
    { transaction: async (operation) => operation() },
  );
  return { service, destinationRepository, rows };
}

describe("WithdrawalDestinationService", () => {
  it("creates trusted enriched destinations and enforces ownership", async () => {
    const { service } = fixture();
    const destination = await service.create("owner", {
      method: "bank_ng",
      name: "Primary",
      values: { bank: "GTBank", account: "0123456789" },
    });
    expect(destination.fields).toEqual([
      { name: "bank", label: "Bank", value: "GTBank", type: "text", copyable: true },
      {
        name: "account",
        label: "Account number",
        value: "0123456789",
        type: "text",
        copyable: true,
      },
      { name: "network", label: "Network", value: "TRC20", type: "fixed", copyable: true },
    ]);
    await expect(service.get("other", destination.id)).rejects.toThrow("not found");
    await expect(service.update("other", destination.id, { name: "stolen" })).rejects.toThrow(
      "not found",
    );
  });

  it("rejects unavailable methods, ineligible accounts and invalid client fields", async () => {
    const { service } = fixture();
    await expect(
      service.create("owner", { method: "missing", name: "x", values: {} }),
    ).rejects.toThrow("unavailable");
    await expect(
      service.create("other", { method: "bank_ng", name: "x", values: {} }),
    ).rejects.toThrow("unavailable");
    await expect(
      service.create("owner", {
        method: "bank_ng",
        name: "x",
        values: { account: "1", network: "spoofed" },
      }),
    ).rejects.toThrow("non-editable");
    await expect(
      service.create("owner", {
        method: "bank_ng",
        name: "x",
        values: { bank: "GT", account: "bad" },
      }),
    ).rejects.toThrow("invalid format");
    await expect(
      service.create("owner", { method: "bank_ng", name: "x", values: {} }),
    ).rejects.toThrow("Bank is required");
  });

  it("rebuilds metadata on edit, preserves an old withdrawal snapshot, and archives without deletion", async () => {
    const { service, destinationRepository, rows } = fixture();
    const created = await service.create("owner", {
      method: "bank_ng",
      name: "Primary",
      values: { bank: "GTBank", account: "0123456789" },
    });
    const snapshot = await service.resolveForWithdrawal("owner", created.id);
    const updated = await service.update("owner", created.id, {
      name: "New primary",
      values: { bank: "Access", account: "9999999999" },
    });
    expect(updated.fields[0]).toMatchObject({
      label: "Bank",
      value: "Access",
      type: "text",
      copyable: true,
    });
    expect(snapshot.fields[1].value).toBe("0123456789");
    expect((await service.resolveForWithdrawal("owner", created.id)).fields[1].value).toBe(
      "9999999999",
    );
    await service.update("owner", created.id, { status: "archived" });
    expect(rows.has(created.id)).toBe(true);
    expect(destinationRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
    await expect(service.resolveForWithdrawal("owner", created.id)).rejects.toThrow("archived");
  });

  it("keeps disabled destinations visible as unavailable history", async () => {
    const existing: SavedWithdrawalDestination = {
      id: "saved",
      accountId: "owner",
      method: "bank_ng",
      name: "Primary",
      fields: [
        {
          name: "account",
          label: "Account",
          value: "0123456789",
          type: "text",
          copyable: true,
        },
      ],
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { service, rows } = fixture({ methods: [{ ...bankMethod, enabled: false }] });
    rows.set(existing.id, existing);
    const history = await service.list("owner");
    expect(history).toMatchObject([{ id: "saved", method: { available: false } }]);
    await expect(service.resolveForWithdrawal("owner", existing.id)).rejects.toThrow("unavailable");
    await expect(
      service.create("owner", {
        method: "bank_ng",
        name: "another",
        values: { account: "0123456789" },
      }),
    ).rejects.toThrow("unavailable");
    expect(await service.methodsFor("owner")).toEqual([]);
  });

  it("projects withdrawal method and saved-method identity without image configuration", async () => {
    const { service } = fixture();
    const methods = await service.methodsFor("owner");
    expect(methods[0]).toEqual({
      id: "bank_ng",
      display_name: "Bank account",
      description: "Nigerian bank account",
      fields: bankMethod.fields,
    });
    expect(methods[0]).not.toHaveProperty("image_url");

    const destination = await service.create("owner", {
      method: "bank_ng",
      name: "Primary",
      values: { bank: "GTBank", account: "0123456789" },
    });
    expect(destination.method).toEqual({
      id: "bank_ng",
      display_name: "Bank account",
      available: true,
    });
    expect(destination.method).not.toHaveProperty("image_url");
  });
});
