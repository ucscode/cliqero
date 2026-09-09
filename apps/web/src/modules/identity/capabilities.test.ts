import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  canAccessOperator,
  canManageCapability,
  hasAnyCapability,
  hasCapability,
  isCapability,
} from "./capabilities";

describe("direct account capabilities", () => {
  it("uses one typed registry and rejects legacy capability values", () => {
    expect(CAPABILITIES).toContain("system.root");
    expect(CAPABILITIES).toContain("catalogue.manage");
    expect(isCapability("operator")).toBe(false);
    expect(isCapability("catalogue_manager")).toBe(false);
  });

  it("allows a directly granted capability or system.root only", () => {
    expect(hasCapability(["catalogue.manage"], "catalogue.manage")).toBe(true);
    expect(hasCapability(["catalogue.manage"], "content.manage")).toBe(false);
    expect(hasCapability(["finance.manage"], "finance.read")).toBe(false);
    expect(hasCapability(["system.root"], "treasury.manage")).toBe(true);
    expect(hasCapability(["system.root"], "unknown.capability")).toBe(false);
  });

  it("supports union checks without creating capability bundles", () => {
    expect(hasAnyCapability(["content.manage"], ["catalogue.manage", "content.manage"])).toBe(true);
    expect(hasAnyCapability([], ["catalogue.manage", "content.manage"])).toBe(false);
  });

  it("keeps root grant and revoke authority separate from ordinary capability management", () => {
    expect(canManageCapability(["capabilities.manage"], "catalogue.manage")).toBe(true);
    expect(canManageCapability(["capabilities.manage"], "system.root")).toBe(false);
    expect(canManageCapability(["system.root"], "system.root")).toBe(true);
  });

  it("only treats capabilities with an operator section as operator-console access", () => {
    expect(canAccessOperator(["capabilities.manage"])).toBe(false);
    expect(canAccessOperator(["api_keys.manage"])).toBe(false);
    expect(canAccessOperator(["system.root"])).toBe(true);
    expect(canAccessOperator(["reviews.moderate"])).toBe(true);
  });
});
