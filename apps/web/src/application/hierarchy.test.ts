import { describe, expect, it } from "vitest";
import { visualizationConfig, visualizationConfigFromValue } from "./hierarchy";
describe("hierarchy visualization configuration", () => {
  it("requires the complete strict structure", () => {
    expect(() => visualizationConfigFromValue(null)).toThrow();
    expect(() => visualizationConfigFromValue({})).toThrow();
    expect(() => visualizationConfigFromValue({ hierarchy: {} })).toThrow();
    expect(() =>
      visualizationConfigFromValue({ hierarchy: { visualization: { depth: 3 } } }),
    ).toThrow();
    expect(() =>
      visualizationConfigFromValue({ hierarchy: { visualization: { child_limit: 50 } } }),
    ).toThrow();
  });
  it("fails clearly when the operational file is absent", () =>
    expect(() => visualizationConfig("config/does-not-exist-visualization.yaml")).toThrow(
      "Required configuration file is missing",
    ));
  it("accepts positive integer depth and child limit without a hierarchy ceiling", () => {
    expect(
      visualizationConfigFromValue({
        hierarchy: { visualization: { depth: 1000, child_limit: 125 } },
      }),
    ).toEqual({ depth: 1000, childLimit: 125 });
    expect(() =>
      visualizationConfigFromValue({ hierarchy: { visualization: { depth: 0, child_limit: 1 } } }),
    ).toThrow();
    expect(() =>
      visualizationConfigFromValue({
        hierarchy: { visualization: { depth: 1.5, child_limit: 1 } },
      }),
    ).toThrow();
  });
});
