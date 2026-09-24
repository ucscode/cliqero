import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import { inspectImage, MAX_IMAGE_BYTES } from "@/modules/listing/media/image";
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
  if (!ipaddr.isValid(address)) return true;
  const parsed = ipaddr.parse(address);
  const deniedRanges =
    parsed.kind() === "ipv4"
      ? [
          "unspecified",
          "private",
          "carrierGradeNat",
          "loopback",
          "linkLocal",
          "reserved",
          "benchmarking",
          "multicast",
          "broadcast",
        ]
      : [
          "unspecified",
          "loopback",
          "uniqueLocal",
          "linkLocal",
          "multicast",
          "reserved",
          "ipv4Mapped",
        ];
  if (deniedRanges.includes(parsed.range())) return true;
  return parsed.kind() === "ipv4" && forbiddenIpv4Cidrs.some((range) => parsed.match(range));
}
const forbiddenIpv4Cidrs = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
].map((cidr) => ipaddr.parseCIDR(cidr));
