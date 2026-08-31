import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { inspectImage, MAX_IMAGE_BYTES } from "@/modules/listing-media/image";
export async function fetchRemoteImage(
  source: string,
  redirects = 0,
): Promise<{ bytes: Uint8Array; mimeType: string; filename: string }> {
  if (redirects > 3) throw new Error("Remote image exceeded redirect limit");
  const url = new URL(source);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Remote image URL must use HTTP or HTTPS");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((item) => isForbiddenAddress(item.address)))
    throw new Error("Remote image host resolves to a private or reserved address");
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        method: "GET",
        headers: {
          accept: "image/png,image/jpeg,image/gif,image/webp",
          "user-agent": "Cliqero-Media-Importer/1.0",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, selected.address, selected.family),
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          fetchRemoteImage(new URL(response.headers.location, url).toString(), redirects + 1).then(
            resolve,
            reject,
          );
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Remote image returned HTTP ${response.statusCode ?? 0}`));
          return;
        }
        const declared = String(response.headers["content-type"] ?? "")
          .split(";", 1)[0]
          .toLowerCase();
        if (!declared.startsWith("image/")) {
          response.resume();
          reject(new Error("Remote response is not an image"));
          return;
        }
        const declaredSize = Number(response.headers["content-length"] ?? 0);
        if (declaredSize > MAX_IMAGE_BYTES) {
          response.resume();
          reject(new Error("Remote image exceeds the 10 MiB limit"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_IMAGE_BYTES) {
            request.destroy(new Error("Remote image exceeds the 10 MiB limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          try {
            const bytes = new Uint8Array(Buffer.concat(chunks));
            const image = inspectImage(bytes, declared);
            resolve({
              bytes,
              mimeType: image.mimeType,
              filename: url.pathname.split("/").at(-1) || "remote-image",
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.setTimeout(10_000, () => request.destroy(new Error("Remote image download timed out")));
    request.on("error", reject);
    request.end();
  });
}
export function isForbiddenAddress(address: string) {
  const value = address.toLowerCase();
  if (isIP(value) === 4) {
    const parts = value.split(".").map(Number),
      n = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    return ranges4.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits));
  }
  if (isIP(value) === 6)
    return (
      value === "::" ||
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe8") ||
      value.startsWith("fe9") ||
      value.startsWith("fea") ||
      value.startsWith("feb") ||
      value.startsWith("ff") ||
      value.startsWith("2001:db8:") ||
      value.startsWith("::ffff:")
    );
  return true;
}
const ranges4: [number, number][] = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];
