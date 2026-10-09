import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatorResourceLink } from "@/components/operator/ui/resource-link";
import { operatorCatalogueRowActions } from "@/components/operator/catalogue";
import { visibleOperatorActions } from "@/components/operator/ui/actions-menu";
import { hasAllCapabilities } from "@/modules/identity/capabilities";

const catalogueActions = operatorCatalogueRowActions(
  { id: "listing-id", state: "draft" } as never,
  true,
  { changeState: vi.fn(), deleteListing: vi.fn(), openListing: vi.fn() },
);

function renderResourceLink(
  requiredCapability: "reviews.moderate" | "finance.read",
  capabilities: readonly string[],
) {
  return renderToStaticMarkup(
    <OperatorResourceLink
      capabilities={capabilities}
      requiredCapability={requiredCapability}
      href={requiredCapability === "reviews.moderate" ? "/operator/reviews" : "/operator/purchases"}
    >
      12
    </OperatorResourceLink>,
  );
}

describe("Operator capability-aware table navigation", () => {
  it.each([
    ["catalogue manager only", ["catalogue.manage"], ["Edit"]],
    [
      "catalogue manager and review moderator",
      ["catalogue.manage", "reviews.moderate"],
      ["Edit", "View reviews"],
    ],
    [
      "catalogue manager and finance reader",
      ["catalogue.manage", "finance.read"],
      ["Edit", "View purchases"],
    ],
    [
      "manager with both inspection grants",
      ["catalogue.manage", "reviews.moderate", "finance.read"],
      ["Edit", "View reviews", "View purchases"],
    ],
    ["root", ["system.root"], ["Edit", "View reviews", "View purchases"]],
    ["read-only or unrelated operator", ["accounts.read"], []],
  ])("filters catalogue actions for %s", (_label, capabilities, expected) => {
    const expectedActions = expected.includes("Edit")
      ? [...expected, "Open listing", "Publish", "Delete"]
      : expected;
    expect(
      visibleOperatorActions(catalogueActions, capabilities).map(({ label }) => label),
    ).toEqual(expectedActions);
  });

  it("keeps counts visible without creating unauthorized navigation links", () => {
    for (const capability of ["reviews.moderate", "finance.read"] as const) {
      const unauthorized = renderResourceLink(capability, ["catalogue.manage"]);
      expect(unauthorized).toContain(">12<");
      expect(unauthorized).not.toContain("<a");
    }

    expect(
      renderResourceLink("reviews.moderate", ["catalogue.manage", "reviews.moderate"]),
    ).toContain('href="/operator/reviews"');
    expect(renderResourceLink("finance.read", ["catalogue.manage", "finance.read"])).toContain(
      'href="/operator/purchases"',
    );
  });

  it("uses the existing root override and never changes backend authorization", () => {
    expect(visibleOperatorActions(catalogueActions, ["system.root"])).toHaveLength(6);
    expect(
      visibleOperatorActions(catalogueActions, ["finance.read"]).map(({ label }) => label),
    ).toEqual(["View purchases"]);
    expect(visibleOperatorActions(catalogueActions, []).map(({ label }) => label)).toEqual([]);
  });

  it("shows parent reassignment only when both account inspection and hierarchy authority exist", () => {
    expect(hasAllCapabilities(["hierarchy.manage"], ["accounts.read", "hierarchy.manage"])).toBe(
      false,
    );
    expect(
      hasAllCapabilities(
        ["accounts.read", "hierarchy.manage"],
        ["accounts.read", "hierarchy.manage"],
      ),
    ).toBe(true);
    expect(hasAllCapabilities(["system.root"], ["accounts.read", "hierarchy.manage"])).toBe(true);
  });
});
