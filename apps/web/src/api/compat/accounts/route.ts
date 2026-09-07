import { z } from "zod";
import { apiError } from "../http";
import { getContainer } from "@/infrastructure/container";
import { PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";
import { usernameSchema } from "@/modules/identity/username";

const bodySchema = z.object({
  email: z.email(),
  username: usernameSchema,
  password: z.string().min(PASSWORD_MIN_LENGTH),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
});
export async function POST(request: Request) {
  try {
    const account = await getContainer().authentication.register(
      bodySchema.parse(await request.json()),
    );
    return Response.json(
      {
        id: account.id,
        email: account.email,
        username: account.username,
        country: account.country,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
