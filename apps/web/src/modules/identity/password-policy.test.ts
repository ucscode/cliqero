import { describe, expect, it } from "vitest";
import { assertPasswordMinimum, PASSWORD_MIN_LENGTH } from "./password-policy";

describe("password policy", () => {
  it("accepts the eight-character minimum", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(() => assertPasswordMinimum("12345678")).not.toThrow();
  });

  it("rejects passwords shorter than the minimum", () => {
    expect(() => assertPasswordMinimum("1234567")).toThrow(
      "Password must contain at least 8 characters",
    );
  });
});
