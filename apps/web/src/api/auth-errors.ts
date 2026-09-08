import { APIError } from "better-auth";
import { PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";
import { PublicApplicationError } from "@/kernel/errors";

/** Maps Better Auth protocol failures to the small public auth error contract. */
export function passwordResetError(error: unknown): PublicApplicationError {
  const code = error instanceof APIError ? error.body?.code : undefined;
  if (code === "INVALID_TOKEN" || code === "USER_NOT_FOUND")
    return new PublicApplicationError(
      "This password reset link is invalid or has expired. Request a new one.",
      "invalid_reset_token",
    );
  if (code === "PASSWORD_TOO_SHORT")
    return new PublicApplicationError(
      `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`,
      "validation_error",
      400,
      { newPassword: `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.` },
    );
  return new PublicApplicationError(
    "We couldn’t reset your password. Please request a new reset link.",
    "password_reset_failed",
  );
}
