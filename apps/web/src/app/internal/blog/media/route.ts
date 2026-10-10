import { apiError } from "@/api/http";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { hasCapability } from "@/modules/identity/capabilities";
import { getContainer } from "@/infrastructure/container";
import { MAX_IMAGE_BYTES } from "@/modules/listing/media/image";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  try {
    const container = getContainer();
    const principal = await container.principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    if (!hasCapability(principal.capabilities, "content.manage"))
      return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0)
      return Response.json(
        { error: "Choose an image file", code: "invalid_input" },
        { status: 400 },
      );
    if (file.size > MAX_IMAGE_BYTES)
      return Response.json(
        { error: "Image exceeds the 10 MiB limit", code: "invalid_input" },
        { status: 400 },
      );
    const result = await container.blogMedia.upload({
      ownerAccountId: principal.accountId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type || undefined,
      origin: new URL(request.url).origin,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error, request);
  }
}
