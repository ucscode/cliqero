import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getAbsoluteFSPath } = require("swagger-ui-dist") as {
  getAbsoluteFSPath(): string;
};

export const runtime = "nodejs";

const assets = new Map([
  ["swagger-ui.css", "text/css; charset=utf-8"],
  ["swagger-ui-bundle.js", "text/javascript; charset=utf-8"],
]);

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const contentType = assets.get(asset);
  if (!contentType) return new Response("Not found", { status: 404 });

  try {
    const body = await readFile(`${getAbsoluteFSPath()}/${asset}`);
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
