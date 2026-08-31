import { z } from "zod";
import { apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";

const bodySchema = z.object({
  handle: z.string().min(3).max(32),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
});

export async function POST(request: Request) {
  try {
    const principal = await getContainer().authentication.principal(request);
    if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (principal.account)
      return Response.json({ error: "Account onboarding is already complete" }, { status: 409 });
    const email = await getContainer().authentication.authUserEmail(principal.authUserId);
    if (!email)
      return Response.json({ error: "Authenticated identity not found" }, { status: 401 });
    const account = await getContainer().authentication.completeOnboarding(principal.authUserId, {
      email,
      ...bodySchema.parse(await request.json()),
    });
    return Response.json(
      { id: account.id, email: account.email, handle: account.handle, country: account.country },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
