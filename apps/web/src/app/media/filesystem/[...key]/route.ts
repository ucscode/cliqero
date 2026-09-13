import { servePublicListingMedia } from "@/app/media/serve";
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  return servePublicListingMedia("filesystem", key);
}
