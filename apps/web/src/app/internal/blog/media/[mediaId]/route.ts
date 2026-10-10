import { apiError } from "@/api/http";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { hasCapability } from "@/modules/identity/capabilities";
import { getContainer } from "@/infrastructure/container";
import { z } from "zod";

export async function DELETE(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  try {
    const container = getContainer();
    const principal = await container.principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    if (!hasCapability(principal.capabilities, "content.manage"))
      return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    const { mediaId } = await context.params;
    z.uuid().parse(mediaId);
    const asset = await container.blogMedia.find(mediaId);
    if (!asset) return Response.json({ error: "Not found", code: "not_found" }, { status: 404 });
    if (asset.ownerAccountId !== principal.accountId)
      return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    if (asset.postId)
      return Response.json(
        {
          error: "The image is attached to an article; save the article change first.",
          code: "media_in_use",
        },
        { status: 409 },
      );
    await container.blogMedia.discard(mediaId, principal.accountId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error, request);
  }
}
