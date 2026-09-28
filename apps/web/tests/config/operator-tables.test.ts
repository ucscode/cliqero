import { describe, expect, it } from "vitest";
import {
  loadOperatorTableConfiguration,
  parseOperatorTableConfiguration,
} from "@/config/operator-tables";

describe("Operator table configuration", () => {
  it("loads the canonical settings used by client selectors and server limits", () => {
    expect(loadOperatorTableConfiguration().tables).toEqual({
      default_page_size: 25,
      max_page_size: 50,
      page_size_options: [25, 50],
      max_bulk_selection: 100,
    });
  });

  it.each([
    { default_page_size: 25, max_page_size: 20, page_size_options: [25], max_bulk_selection: 10 },
    {
      default_page_size: 20,
      max_page_size: 50,
      page_size_options: [25, 50],
      max_bulk_selection: 10,
    },
    {
      default_page_size: 25,
      max_page_size: 50,
      page_size_options: [25, 25],
      max_bulk_selection: 10,
    },
    {
      default_page_size: 25,
      max_page_size: 50,
      page_size_options: [25, 75],
      max_bulk_selection: 10,
    },
    {
      default_page_size: 25,
      max_page_size: 50,
      page_size_options: [25, 50],
      max_bulk_selection: 0,
    },
  ])("rejects inconsistent or invalid page-size configuration", (tables) => {
    expect(() => parseOperatorTableConfiguration({ tables })).toThrow();
  });
});
