import { z } from "zod";
import { authenticatedAccount, apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { usernameSchema } from "@/modules/identity/username";
const schema = z
  .object({
    username: usernameSchema.optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one profile field is required");
const view = (
  id: string,
  profile: { email: string; username: string; country: string | null },
) => ({
  id,
  ...profile,
});
export async function GET(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(view(a.id, await getContainer().profiles.get(a.id)));
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await getContainer().profiles.update(a.id, schema.parse(await request.json()));
    return Response.json(view(a.id, await getContainer().profiles.get(a.id)));
  } catch (error) {
    return apiError(error);
  }
}
