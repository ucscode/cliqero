import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../http";
import { getContainer } from "@/infrastructure/container";
import { mediaView } from "@/application/listing-media";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireCatalogueManager(account.id);
    const items = await c.listingMedia.listCatalogue(account, (await params).id);
    return Response.json({ items: items.map((x) => mediaView(x, c.listingMedia.publicUrl(x))) });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireCatalogueManager(account.id);
    const f = await request.formData(),
      file = f.get("file");
    if (!(file instanceof File)) throw new Error("Image file is required");
    const b = z
        .object({
          position: z.coerce.number().int().min(0).optional(),
          alt: z.string().max(500).optional(),
        })
        .parse({
          position: f.get("position") === null ? undefined : f.get("position"),
          alt: typeof f.get("alt_text") === "string" ? f.get("alt_text") : undefined,
        }),
      v = await c.listingMedia.createCatalogue(account, (await params).id, {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type,
        filename: file.name,
        position: b.position,
        altText: b.alt,
      });
    return Response.json(mediaView(v, c.listingMedia.publicUrl(v)), { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
