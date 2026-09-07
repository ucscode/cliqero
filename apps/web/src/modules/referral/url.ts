import { siteConfig } from "@/config/site";

/**
 * Referral URLs are deterministic and based on immutable public identifiers.
 * Username changes therefore never invalidate an existing share.
 */
export function referralPath(referrerAccountId: string, listingId: string): string {
  return `/r/${encodeURIComponent(referrerAccountId)}/${encodeURIComponent(listingId)}`;
}

export function referralUrl(referrerAccountId: string, listingId: string): string {
  return new URL(referralPath(referrerAccountId, listingId), siteConfig.url).toString();
}
