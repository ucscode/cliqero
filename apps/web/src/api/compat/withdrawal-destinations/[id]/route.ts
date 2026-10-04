import { z } from "zod";
import { apiError, authenticatedPrincipal } from "../../http";
import { validationErrorPayload } from "@/api/error";
import { getContainer } from "@/infrastructure/container";
import { withdrawalDestinationPatchSchema } from "../contracts";

const paramsSchema = z.object({ destinationId: z.string().uuid() });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ destinationId: string }> },
) {
  const principal = await authenticatedPrincipal(request);
  if (principal.kind === "anonymous")
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:read"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    const { destinationId } = paramsSchema.parse(await params);
    return Response.json(
      await getContainer().withdrawalDestinations.get(principal.accountId, destinationId),
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(validationErrorPayload(error), { status: 400 });
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ destinationId: string }> },
) {
  const principal = await authenticatedPrincipal(request);
  if (principal.kind === "anonymous")
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:create"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    const { destinationId } = paramsSchema.parse(await params);
    const body = withdrawalDestinationPatchSchema.parse(await request.json());
    return Response.json(
      await getContainer().withdrawalDestinations.update(principal.accountId, destinationId, body),
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(validationErrorPayload(error), { status: 400 });
    return apiError(error);
  }
}
