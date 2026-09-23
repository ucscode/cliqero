import { accountReferralSource } from "@/api/http";
import { getContainer } from "@/infrastructure/container";
import {
  ACCOUNT_REFERRAL_COOKIE,
  LISTING_REFERRAL_COOKIE,
  referralCookieHeader,
} from "@/modules/referral/cookie";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ referrer: string; listing: string }> },
) {
  const { referrer, listing } = await params;
  const visit = await getContainer().referralAttribution.visit(referrer, listing);
  if (!visit) return Response.json({ error: "Not found" }, { status: 404 });
  const accountVisit = await getContainer().accountReferralAttribution.visit(
    referrer,
    accountReferralSource(request),
  );
  if (!accountVisit) return Response.json({ error: "Not found" }, { status: 404 });
  const headers = new Headers({ location: `/listings/${encodeURIComponent(visit.listingId)}` });
  headers.append("Set-Cookie", referralCookieHeader(LISTING_REFERRAL_COOKIE, visit.source));
  headers.append("Set-Cookie", referralCookieHeader(ACCOUNT_REFERRAL_COOKIE, accountVisit.source));
  return new Response(null, {
    status: 307,
    headers,
  });
}
