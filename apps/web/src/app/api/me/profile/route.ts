import { z } from "zod";
import { authenticatedAccount, apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
const schema = z
  .object({
    email: z.email().optional(),
    handle: z.string().min(3).max(32).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
  })
  .strict();
const view = (a: { id: string; email: string; handle: string; country: string | null }) => ({
  id: a.id,
  email: a.email,
  handle: a.handle,
  country: a.country,
});
export async function GET(request: Request) {
  const a = await authenticatedAccount(request);
  return a ? Response.json(view(a)) : Response.json({ error: "Unauthorized" }, { status: 401 });
}
export async function PATCH(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(
      view(await getContainer().profiles.update(a.id, schema.parse(await request.json()))),
    );
  } catch (error) {
    return apiError(error);
  }
}
