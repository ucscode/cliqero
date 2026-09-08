import { describe, expect, it } from "vitest";
import { APIError } from "better-auth";
import { passwordResetError } from "./auth-errors";

describe("password reset API errors", () => {
  it("normalizes Better Auth reset-token failures without exposing protocol details", () => {
    expect(
      passwordResetError(APIError.from("BAD_REQUEST", { code: "INVALID_TOKEN", message: "x" })),
    ).toMatchObject({
      code: "invalid_reset_token",
      message: "This password reset link is invalid or has expired. Request a new one.",
    });
  });

  it("returns a useful password validation field error", () => {
    expect(
      passwordResetError(
        APIError.from("BAD_REQUEST", { code: "PASSWORD_TOO_SHORT", message: "x" }),
      ),
    ).toMatchObject({
      code: "validation_error",
      fields: { newPassword: "Password must contain at least 8 characters." },
    });
  });
});
