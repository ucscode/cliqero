import { z } from "zod";
import { apiError } from "../../../http";
import { getContainer } from "@/infrastructure/container";
import { verifyCaptchaToken } from "@/security/captcha";
import { PublicApplicationError } from "@/kernel/errors";

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
    )
      return Response.json(
        { error: "Please complete the CAPTCHA challenge.", code: "captcha_failed" },
        { status: 400 },
      );
    await getContainer().authentication.auth.api.requestPasswordReset({ body });
    return Response.json(success);
  } catch (error) {
    return apiError(
      error instanceof z.ZodError
        ? error
        : new PublicApplicationError(
            "We couldn’t process that request. Please try again.",
            "password_reset_request_failed",
          ),
    );
  }
}
