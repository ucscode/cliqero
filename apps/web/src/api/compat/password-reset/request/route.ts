import { z } from "zod";
import { apiError } from "../../../http";
import { getContainer } from "@/infrastructure/container";
import { verifyCaptchaToken } from "@/security/captcha";
import { PublicApplicationError } from "@/kernel/errors";
import { writeDevelopmentDiagnostic } from "@/infrastructure/development-log";

const bodySchema = z.object({
  email: z.email("Enter a valid email address."),
  redirectTo: z.string().url(),
  captchaToken: z.string().optional(),
});
const success = {
  status: true,
  message: "If an account exists for that email, a reset link is on its way.",
};

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    if (
      !(await verifyCaptchaToken(body.captchaToken, request.headers.get("x-forwarded-for"), true))
    ) {
      writeDevelopmentDiagnostic({
        level: "warn",
        event: "security.captcha.rejected",
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return Response.json(
        { error: "Please complete the CAPTCHA challenge.", code: "captcha_failed" },
        { status: 400 },
      );
    }
    await getContainer().authentication.auth.api.requestPasswordReset({ body });
    return Response.json(success);
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      writeDevelopmentDiagnostic({
        level: "error",
        event: "auth.password_reset_request.failed",
        method: request.method,
        path: new URL(request.url).pathname,
        error,
      });
    }
    return apiError(
      error instanceof z.ZodError
        ? error
        : new PublicApplicationError(
            "We couldn’t process that request. Please try again.",
            "password_reset_request_failed",
          ),
      request,
    );
  }
}
