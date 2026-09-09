import { z } from "zod";
import { apiError } from "../http";
import { getContainer } from "@/infrastructure/container";
import { PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";
import { usernameSchema } from "@/modules/identity/username";
import { verifyCaptchaToken } from "@/security/captcha";

const bodySchema = z.object({
  email: z.email("Enter a valid email address."),
  username: usernameSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/, "Choose a valid country.")
    .optional(),
  captchaToken: z.string().optional(),
});
export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json());
    if (
      !(await verifyCaptchaToken(input.captchaToken, request.headers.get("x-forwarded-for"), true))
    )
      return Response.json(
        { error: "Please complete the CAPTCHA challenge.", code: "captcha_failed" },
        { status: 400 },
      );
    const account = await getContainer().authentication.register(input);
    const profile = await getContainer().profiles.get(account.id);
    return Response.json(
      {
        id: account.id,
        email: profile.email,
        username: account.username,
        country: account.country,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
