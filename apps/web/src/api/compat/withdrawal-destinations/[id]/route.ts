import { z } from "zod";
import { apiError, authenticatedPrincipal } from "../../http";
import { validationErrorPayload } from "@/api/error";
import { getContainer } from "@/infrastructure/container";

const valuesSchema = z.record(z.string(), z.string());
const paramsSchema = z.object({ id: z.string().uuid() });
const patchSchema = z.union([
  z.object({ status: z.literal("archived") }).strict(),
  z
    .object({ name: z.string().min(1).max(100).optional(), values: valuesSchema.optional() })
    .strict()
    .refine((body) => body.name !== undefined || body.values !== undefined),
]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:read"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    const { id } = paramsSchema.parse(await params);
    return Response.json(await getContainer().withdrawalDestinations.get(principal.accountId, id));
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(validationErrorPayload(error), { status: 400 });
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:create"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    const { id } = paramsSchema.parse(await params);
    const body = patchSchema.parse(await request.json());
    return Response.json(
      await getContainer().withdrawalDestinations.update(principal.accountId, id, body),
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(validationErrorPayload(error), { status: 400 });
    return apiError(error);
  }
}
