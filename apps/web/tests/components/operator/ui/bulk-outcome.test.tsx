import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  groupBulkFailureReasons,
  OperatorBulkOutcome,
  type OperatorBulkOutcomeData,
} from "@/components/operator/ui/bulk-outcome";

function outcome(failures: OperatorBulkOutcomeData["failures"]): OperatorBulkOutcomeData {
  return { resource: "listings", selectedCount: failures.length, failures };
}

describe("operator bulk outcome", () => {
  it("renders no mutation alert when every selected item succeeds", () => {
    expect(renderToStaticMarkup(<OperatorBulkOutcome outcome={outcome([])} />)).toBe("");
  });

  it("shows a concise count and reason for a single failure without retry UI", () => {
    const html = renderToStaticMarkup(
      <OperatorBulkOutcome
        outcome={{
          resource: "listing",
          selectedCount: 1,
          failures: [{ id: "listing-1", label: "Launch checklist", message: "Could not publish." }],
        }}
      />,
    );

    expect(html).toContain("Some selected items could not be processed");
    expect(html).toContain("1 of 1 selected listing failed.");
    expect(html).toContain("Could not publish.");
    expect(html).toContain("Launch checklist");
    expect(html).not.toContain("Try again");
  });

  it("groups repeated reasons while retaining bounded, expandable per-item details", () => {
    const failures = Array.from({ length: 28 }, (_, index) => ({
      id: `listing-${index}`,
      label: `Listing ${index}`,
      message: "Only a draft listing can be published.",
    }));
    const html = renderToStaticMarkup(
      <OperatorBulkOutcome outcome={{ resource: "listings", selectedCount: 29, failures }} />,
    );

    expect(html).toContain("28 of 29 selected listings failed.");
    expect(groupBulkFailureReasons(failures)).toEqual([
      { message: "Only a draft listing can be published.", count: 28 },
    ]);
    expect(html).toContain(
      '<li><span class="font-semibold">28 — </span>Only a draft listing can be published.</li>',
    );
    expect(html).toContain("max-h-28");
    expect(html).toContain("max-h-40");
    expect(html).toContain("<details");
    expect(html).toContain("Listing 27");
    expect(html).not.toContain("Try again");
  });

  it("counts distinct failure reasons separately and preserves labels", () => {
    const failures = [
      { id: "listing-1", label: "Launch checklist", message: "Not a draft." },
      { id: "listing-2", label: "Discovery cards", message: "Not a draft." },
      { id: "listing-3", label: "Old product", message: "Listing could not be found." },
    ];
    const html = renderToStaticMarkup(
      <OperatorBulkOutcome outcome={{ resource: "listings", selectedCount: 5, failures }} />,
    );

    expect(groupBulkFailureReasons(failures)).toEqual([
      { message: "Not a draft.", count: 2 },
      { message: "Listing could not be found.", count: 1 },
    ]);
    expect(html).toContain('<span class="font-semibold">2 — </span>Not a draft.</li>');
    expect(html).toContain("Listing could not be found.");
    expect(html).toContain("Launch checklist");
    expect(html).toContain("Discovery cards");
    expect(html).toContain("Old product");
  });
});
