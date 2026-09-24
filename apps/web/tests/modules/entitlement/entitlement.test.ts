import { describe, expect, it } from "vitest";
import { Entitlement } from "@/modules/entitlement/entitlement";

describe("Entitlement", () => {
  const future = new Date("2030-01-01T00:00:00.000Z");
  const past = new Date("2020-01-01T00:00:00.000Z");
  const now = new Date("2025-01-01T00:00:00.000Z");

  it("is usable while active and unexpired, and rejects elapsed expiry", () => {
    expect(new Entitlement("e", "b", "l", "p").isUsableAt(now)).toBe(true);
    expect(new Entitlement("e", "b", "l", "p", future).isUsableAt(now)).toBe(true);
    expect(new Entitlement("e", "b", "l", "p", past).isUsableAt(now)).toBe(false);
  });

  it.each(["consumed", "revoked", "expired"] as const)(
    "%s entitlement is never usable",
    (state) => {
      expect(Entitlement.restore("e", "b", "l", "p", state, future).isUsableAt(now)).toBe(false);
    },
  );

  it.each([
    ["consume", (entitlement: Entitlement) => entitlement.consume(), "consumed"],
    ["revoke", (entitlement: Entitlement) => entitlement.revoke(), "revoked"],
    ["expire", (entitlement: Entitlement) => entitlement.expire(), "expired"],
  ] as const)("supports %s as an explicit terminal transition", (_name, transition, state) => {
    const entitlement = new Entitlement("e", "b", "l", "p");
    expect(transition(entitlement)).toBe(true);
    expect(entitlement.state).toBe(state);
    expect(entitlement.isUsableAt(now)).toBe(false);
    expect(transition(entitlement)).toBe(false);
  });

  it.each(["consumed", "revoked", "expired"] as const)(
    "does not allow %s to be reopened",
    (state) => {
      const entitlement = Entitlement.restore("e", "b", "l", "p", state);
      expect(() => entitlement.transitionTo("active")).toThrow(/cannot transition to active/);
    },
  );
});
