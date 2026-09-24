import { z } from "zod";
import { apiError, authenticatedPrincipal } from "../http";
import { validationErrorPayload } from "@/api/error";
import { getContainer } from "@/infrastructure/container";

const valuesSchema = z.record(z.string(), z.string());
const createSchema = z
  .object({
    method: z.string().min(1).max(80),
    name: z.string().min(1).max(100),
    values: valuesSchema,
  })
  .strict();

export async function GET(request: Request) {
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:read"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    return Response.json(await getContainer().withdrawalDestinations.list(principal.accountId));
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(validationErrorPayload(error), { status: 400 });
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:create"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    const body = createSchema.parse(await request.json());
    const destination = await getContainer().withdrawalDestinations.create(
      principal.accountId,
      body,
    );
    return Response.json(destination, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(validationErrorPayload(error), { status: 400 });
    return apiError(error);
  }
}
