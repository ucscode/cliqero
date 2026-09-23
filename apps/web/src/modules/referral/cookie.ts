export const ACCOUNT_REFERRAL_COOKIE = "cliqero_referrer";
export const LISTING_REFERRAL_COOKIE = "cliqero_attribution";
export const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function secureSuffix(): string {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function referralCookieHeader(name: string, value: string): string {
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${REFERRAL_COOKIE_MAX_AGE}${secureSuffix()}`;
}

export function clearReferralCookieHeader(name: string): string {
  return `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureSuffix()}`;
}
