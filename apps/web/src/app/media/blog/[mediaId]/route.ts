import { getContainer } from "@/infrastructure/container";
import { hasCapability } from "@/modules/identity/capabilities";
import { blogMediaLocator } from "@/application/blog/media";
import { z } from "zod";

export async function GET(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  const container = getContainer();
  const { mediaId } = await context.params;
  if (!z.uuid().safeParse(mediaId).success) return new Response("Not found", { status: 404 });
  try {
    const asset = await container.blogMedia.find(mediaId);
    if (!asset || asset.state !== "active") return new Response("Not found", { status: 404 });
    const publicArticle = asset.postId ? container.blog.get(asset.postId, true) : null;
    let privateOwner = false;
    if (!publicArticle) {
      try {
        const principal = await container.principalResolver.resolve(request);
        privateOwner =
          principal.kind === "user_session" &&
          principal.accountId === asset.ownerAccountId &&
          hasCapability(principal.capabilities, "content.manage");
      } catch {
        privateOwner = false;
      }
    }
    if (!publicArticle && !privateOwner) return new Response("Not found", { status: 404 });
    const provider = container.objectStorage.get(asset.storageProvider);
    if (provider.visibility === "private" || !provider.read)
      return new Response("Not found", { status: 404 });
    const image = await provider.read(blogMediaLocator(asset));
    return new Response(Buffer.from(image.bytes), {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(asset.byteSize),
        "cache-control": publicArticle
          ? "public, max-age=31536000, immutable"
          : "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
