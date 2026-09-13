import { servePublicListingMedia } from "@/app/media/serve";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ provider: string; key: string[] }> },
) {
  const value = await params;
  return servePublicListingMedia(value.provider, value.key.join("/"));
}
