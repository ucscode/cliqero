import { describe, expect, it } from "vitest";
import { DomainInvariantError } from "@/kernel/errors";
import { validateReviewInput } from "./review";

describe("listing review input", () => {
  it("accepts a rating-only review", () => {
    expect(validateReviewInput(5, undefined)).toBe("");
  });
  it("rejects ratings outside one through five", () => {
    expect(() => validateReviewInput(0, "")).toThrow(DomainInvariantError);
    expect(() => validateReviewInput(5.5, "")).toThrow(DomainInvariantError);
  });
  it("rejects bodies longer than the public limit", () => {
    expect(() => validateReviewInput(4, "x".repeat(2001))).toThrow(DomainInvariantError);
  });
});
