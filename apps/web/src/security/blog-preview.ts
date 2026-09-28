import { createHmac, timingSafeEqual } from "node:crypto";

const PREVIEW_LIFETIME_SECONDS = 5 * 60;

type PreviewClaims = { postId: string; accountId: string; expiresAt: number };

export function issueBlogPreviewToken(
  postId: string,
  accountId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload = Buffer.from(
    JSON.stringify({ postId, accountId, expiresAt: nowSeconds + PREVIEW_LIFETIME_SECONDS }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyBlogPreviewToken(
  token: string,
  postId: string,
  accountId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const [payload, signature, extra] = token.split(".");
  if (
    !payload ||
    !signature ||
    extra ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]+$/.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PreviewClaims;
    return (
      claims.postId === postId &&
      claims.accountId === accountId &&
      Number.isSafeInteger(claims.expiresAt) &&
      claims.expiresAt > nowSeconds
    );
  } catch {
    return false;
  }
}
