import { z } from "zod";
import { apiError } from "../../http";
import { passwordResetError } from "@/api/auth-errors";
import { getContainer } from "@/infrastructure/container";
import { PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";

const bodySchema = z.object({
  token: z.string().min(1),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    await getContainer().authentication.auth.api.resetPassword({ body });
    return Response.json({ status: true });
  } catch (error) {
    return apiError(error instanceof z.ZodError ? error : passwordResetError(error));
  }
}
