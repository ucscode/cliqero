import { getContainer } from "@/infrastructure/container";
import { apiError } from "@/api/http";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { blogPostInputSchema } from "@/modules/blog/domain/blog";
import { hasCapability } from "@/modules/identity/capabilities";
import { z } from "zod";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  try {
    const principal = await getContainer().principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    if (!hasCapability(principal.capabilities, "content.manage"))
      return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    const body = blogPostInputSchema
      .extend({ preview_id: z.uuid().nullable().optional() })
      .parse(await request.json());
    const { preview_id, ...input } = body;
    const preview = getContainer().blog.createPreview(
      input,
      principal.accountId,
      preview_id ?? undefined,
    );
    return Response.json({ previewId: preview.id, url: preview.url });
  } catch (error) {
    return apiError(error, request);
  }
}
