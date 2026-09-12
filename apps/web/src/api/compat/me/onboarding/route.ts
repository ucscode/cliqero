import { z } from "zod";
import { apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { usernameSchema } from "@/modules/identity/username";
import { PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";

const bodySchema = z.object({
  username: usernameSchema,
  country: z.string().regex(/^[A-Za-z]{2}$/, "Choose a valid country."),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`)
    .optional(),
});

export async function GET(request: Request) {
  try {
    const principal = await getContainer().authentication.principal(request);
    if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (principal.account)
      return Response.json({ error: "Account onboarding is already complete" }, { status: 409 });
    return Response.json({
      hasPassword: await getContainer().authentication.hasPasswordCredential(principal.authUserId),
    });
  } catch (error) {
    return apiError(error, request);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await getContainer().authentication.principal(request);
    if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (principal.account)
      return Response.json({ error: "Account onboarding is already complete" }, { status: 409 });
    const account = await getContainer().authentication.completeOnboarding(
      principal.authUserId,
      bodySchema.parse(await request.json()),
      request.headers,
    );
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
    return apiError(error, request);
  }
}
