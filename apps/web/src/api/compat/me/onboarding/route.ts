import { z } from "zod";
import { apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { usernameSchema } from "@/modules/identity/username";

const bodySchema = z.object({
  username: usernameSchema,
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .nullable()
    .optional(),
});

export async function POST(request: Request) {
  try {
    const principal = await getContainer().authentication.principal(request);
    if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (principal.account)
      return Response.json({ error: "Account onboarding is already complete" }, { status: 409 });
    const account = await getContainer().authentication.completeOnboarding(principal.authUserId, {
      ...bodySchema.parse(await request.json()),
    });
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
