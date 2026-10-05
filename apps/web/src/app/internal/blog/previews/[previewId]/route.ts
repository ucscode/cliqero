import { getContainer } from "@/infrastructure/container";
import { apiError } from "@/api/http";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { hasCapability } from "@/modules/identity/capabilities";
import { z } from "zod";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ previewId: string }> },
) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  try {
    const principal = await getContainer().principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    if (!hasCapability(principal.capabilities, "content.manage"))
      return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    const { previewId } = await context.params;
    z.uuid().parse(previewId);
    getContainer().blog.deletePreview(previewId, principal.accountId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error, request);
  }
}
