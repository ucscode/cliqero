import { describe, expect, it, vi } from "vitest";
import { TransactionPinService } from "@/application/identity/transaction-pin";
import type { TransactionPinRepository } from "@/modules/identity/transaction-pin";

function fixture() {
  const values = new Map<string, string>();
  let attempts = 0;
  let locked = false;
  const repository: TransactionPinRepository = {
    exists: async (id) => values.has(id),
    set: async (id, hash, onlyIfMissing = false) => {
      if (onlyIfMissing && values.has(id)) return false;
      values.set(id, hash);
      attempts = 0;
      locked = false;
      return true;
    },
    verify: async (id, pin, verifyHash) => {
      if (locked) return "locked";
      const hash = values.get(id);
      if (!hash) return "missing";
      if (await verifyHash(pin, hash)) {
        attempts = 0;
        return "valid";
      }
      attempts += 1;
      if (attempts >= 5) {
        locked = true;
        return "locked";
      }
      return "invalid";
    },
    change: async (id, currentPin, nextHash, verifyHash) => {
      const hash = values.get(id);
      if (!hash) return "missing";
      if (locked) return "locked";
      if (!(await verifyHash(currentPin, hash))) {
        attempts += 1;
        if (attempts >= 5) {
          locked = true;
          return "locked";
        }
        return "invalid";
      }
      values.set(id, nextHash);
      attempts = 0;
      return "valid";
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const identity = {
    accountEmailVerified: async () => true,
    accountEmail: async () => "person@example.test",
  };
  const gateway = {
    requestTransactionPinRecoveryCode: vi.fn(async () => undefined),
    verifyTransactionPinRecoveryCode: vi.fn(async () => undefined),
  };
  const service = new TransactionPinService(
    repository,
    {
      hashTransactionPin: async (pin) => `password-hash:${pin}`,
      verifyTransactionPin: async (pin, hash) => hash === `password-hash:${pin}`,
    },
    identity as never,
    gateway,
    audit,
  );
  return { service, repository, values, gateway, audit };
}

describe("TransactionPinService", () => {
  it("stores only a hash, exposes status, and verifies a valid six-digit PIN", async () => {
    const { service, values, audit } = fixture();
    await service.set("account-1", "123456");
    expect(values.get("account-1")).not.toBe("123456");
    await expect(service.status("account-1")).resolves.toEqual({ configured: true });
    await expect(service.requireValidPin("account-1", "123456")).resolves.toBeUndefined();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "transaction_pin.set" }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("123456");
  });

  it("requires verified email and limits invalid attempts before locking", async () => {
    const { service } = fixture();
    await service.set("account-1", "123456");
    for (let attempt = 0; attempt < 4; attempt += 1)
      await expect(service.requireValidPin("account-1", "999999")).rejects.toMatchObject({
        code: "invalid_transaction_pin",
        status: 403,
      });
    await expect(service.requireValidPin("account-1", "999999")).rejects.toMatchObject({
      code: "transaction_pin_locked",
      status: 429,
    });
    await expect(service.requireValidPin("account-1", "123456")).rejects.toMatchObject({
      code: "transaction_pin_locked",
    });
  });

  it("recovers only with the verified-email one-time code and never audits the PIN", async () => {
    const { service, gateway, audit } = fixture();
    await service.requestRecovery("account-1");
    expect(gateway.requestTransactionPinRecoveryCode).toHaveBeenCalledWith("person@example.test");
    await service.recover("account-1", "123456", "654321");
    await expect(service.requireValidPin("account-1", "654321")).resolves.toBeUndefined();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "transaction_pin.recovered" }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("654321");
  });

  it("does not permit replacing an already configured PIN through set", async () => {
    const { service } = fixture();
    await service.set("account-1", "123456");
    await expect(service.set("account-1", "654321")).rejects.toMatchObject({
      code: "transaction_pin_already_configured",
    });
  });

  it("changes a PIN only after atomically verifying the current PIN", async () => {
    const { service } = fixture();
    await service.set("account-1", "123456");
    await expect(service.change("account-1", "000000", "654321")).rejects.toMatchObject({
      code: "invalid_transaction_pin",
    });
    await expect(service.requireValidPin("account-1", "123456")).resolves.toBeUndefined();
    await service.change("account-1", "123456", "654321");
    await expect(service.requireValidPin("account-1", "654321")).resolves.toBeUndefined();
  });
});
