import { z } from "zod";
import { apiError } from "@/api/compat/http";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { getContainer } from "@/infrastructure/container";

const updateSchema = z
  .object({
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => value.country !== undefined, "Provide a country value.");

export async function GET(request: Request) {
  try {
    const principal = await getContainer().principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    return Response.json(
      { id: principal.accountId, ...(await getContainer().profiles.get(principal.accountId)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error, request);
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  try {
    const principal = await getContainer().principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    await getContainer().profiles.update(
      principal.accountId,
      updateSchema.parse(await request.json()),
    );
    return Response.json(
      { id: principal.accountId, ...(await getContainer().profiles.get(principal.accountId)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error, request);
  }
}
