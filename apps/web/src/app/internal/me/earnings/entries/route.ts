import { z } from "zod";
import { apiError } from "@/api/compat/http";
import { getContainer } from "@/infrastructure/container";

const querySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    const container = getContainer();
    const principal = await container.principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(
      await container.accountProjections.earningEntries(principal.accountId, query),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error, request);
  }
}
