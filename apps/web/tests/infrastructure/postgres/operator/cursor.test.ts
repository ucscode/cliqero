import { describe, expect, it } from "vitest";
import {
  decodeOperatorSortCursor,
  encodeOperatorSortCursor,
} from "@/infrastructure/postgres/operator/cursor";

describe("operator sorted collection cursors", () => {
  it("round-trips the complete sort tuple and binds it to the active ordering", () => {
    const token = encodeOperatorSortCursor({
      sort: "amount",
      direction: "asc",
      value: "1000",
      id: "42",
    });

    expect(decodeOperatorSortCursor(token, "amount", "asc")).toEqual({
      sort: "amount",
      direction: "asc",
      value: "1000",
      id: "42",
    });
    expect(() => decodeOperatorSortCursor(token, "created", "asc")).toThrow(
      "Invalid or stale pagination cursor",
    );
    expect(() => decodeOperatorSortCursor(token, "amount", "desc")).toThrow(
      "Invalid or stale pagination cursor",
    );
    expect(() => decodeOperatorSortCursor("invalid", "amount", "asc")).toThrow(
      "Invalid or stale pagination cursor",
    );
  });
});
