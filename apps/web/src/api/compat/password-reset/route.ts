import { z } from "zod";
import { apiError } from "../../http";
import { passwordResetError } from "@/api/auth-errors";
import { getContainer } from "@/infrastructure/container";
import { PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";
import type { BetterAuthInstance } from "@/modules/identity/better-auth";
import { logDevelopmentError } from "@/infrastructure/development-log";

const bodySchema = z.object({
  token: z.string().min(1),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`),
});

export async function handlePasswordReset(
  request: Request,
  auth: BetterAuthInstance,
): Promise<Response> {
  try {
    const body = bodySchema.parse(await request.json());
    await auth.api.resetPassword({ body });
    return Response.json({ status: true });
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      logDevelopmentError(error, {
        event: "auth.password_reset.failed",
        method: request.method,
        path: new URL(request.url).pathname,
      });
    }
    return apiError(error instanceof z.ZodError ? error : passwordResetError(error), request);
  }
}

export async function POST(request: Request) {
  return handlePasswordReset(request, getContainer().authentication.auth);
}
