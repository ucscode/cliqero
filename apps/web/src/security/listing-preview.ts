import { createHmac, timingSafeEqual } from "node:crypto";

const PURPOSE = "listing-preview";
const LIFETIME_SECONDS = 10 * 60;

function secret() {
  const value = process.env.BETTER_AUTH_SECRET?.trim();
  if (!value) throw new Error("BETTER_AUTH_SECRET is required for listing previews.");
  return value;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createListingPreviewToken(listingId: string, now = Date.now()) {
  const payload = encode(
    JSON.stringify({
      listing_id: listingId,
      purpose: PURPOSE,
      expires_at: Math.floor(now / 1000) + LIFETIME_SECONDS,
    }),
  );
  return `${payload}.${sign(payload)}`;
}

export function verifyListingPreviewToken(
  token: string | null | undefined,
  listingId: string,
  now = Date.now(),
) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const actual = Buffer.from(signature, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes))
    return false;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      listing_id?: unknown;
      purpose?: unknown;
      expires_at?: unknown;
    };
    return (
      value.listing_id === listingId &&
      value.purpose === PURPOSE &&
      typeof value.expires_at === "number" &&
      value.expires_at >= Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}

export const LISTING_PREVIEW_LIFETIME_SECONDS = LIFETIME_SECONDS;
