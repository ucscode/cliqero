import { describe, expect, it, vi } from "vitest";
import { PackageEntitlementService } from "@/application/package/entitlements";
import { ScopedIntegration } from "@/modules/access/integrations";
import { Entitlement } from "@/modules/entitlement/entitlement";

function setup(initial = new Entitlement("entitlement-1", "buyer-1", "listing-1", "purchase-1")) {
  let current: Entitlement | null = initial;
  const transaction = vi.fn(async (operation: () => Promise<unknown>) => operation());
  const findById = vi.fn(async (id?: string) => (id === "missing" ? null : current));
  const save = vi.fn(async (entitlement: Entitlement) => {
    current = entitlement;
  });
  const record = vi.fn(async () => undefined);
  return {
    service: new PackageEntitlementService(
      { findById, save } as any,
      { transaction } as any,
      { record } as any,
      () => new Date("2026-01-01T00:00:00.000Z"),
    ),
    integration: new ScopedIntegration("integration-1", "owner-1", new Set(["listing-1"])),
    findById,
    save,
    record,
    transaction,
    current: () => current,
  };
}

describe("PackageEntitlementService", () => {
  it("locks and persists a consumption once, auditing only the real transition", async () => {
    const test = setup();
    const results = await Promise.all([
      test.service.update(test.integration, "entitlement-1", { state: "consumed" }),
      test.service.update(test.integration, "entitlement-1", { state: "consumed" }),
    ]);
    expect(results.map((result) => result.state)).toEqual(["consumed", "consumed"]);
    expect(test.transaction).toHaveBeenCalledTimes(2);
    expect(test.findById).toHaveBeenCalledWith("entitlement-1", { forUpdate: true });
    expect(test.save).toHaveBeenCalledTimes(1);
    expect(test.record).toHaveBeenCalledTimes(1);
  });

  it("returns the same not-found behavior for missing and out-of-scope entitlements", async () => {
    const test = setup();
    await expect(test.service.get(test.integration, "missing")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    const outOfScope = new ScopedIntegration("other", "owner-2", new Set());
    await expect(
      test.service.update(outOfScope, "entitlement-1", { state: "revoked" }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(test.save).not.toHaveBeenCalled();
  });

  it("rejects active expiry in the past and allows clearing expiry", async () => {
    const test = setup();
    await expect(
      test.service.update(test.integration, "entitlement-1", {
        expiresAt: new Date("2025-12-31T23:59:59.000Z"),
      }),
    ).rejects.toMatchObject({ code: "invalid_entitlement_expiry" });
    expect(test.save).not.toHaveBeenCalled();
    const result = await test.service.update(test.integration, "entitlement-1", {
      expiresAt: null,
    });
    expect(result.expires_at).toBeNull();
    expect(result.access_available).toBe(true);
  });

  it("returns minimal entitlement data with temporal availability", async () => {
    const test = setup(new Entitlement("entitlement-1", "buyer-1", "listing-1", "purchase-1"));
    await expect(test.service.get(test.integration, "entitlement-1")).resolves.toEqual({
      id: "entitlement-1",
      listing_id: "listing-1",
      state: "active",
      expires_at: null,
      access_available: true,
    });
  });
});
