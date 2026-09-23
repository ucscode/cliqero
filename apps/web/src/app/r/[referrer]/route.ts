import { accountReferralSource } from "@/api/http";
import { getContainer } from "@/infrastructure/container";
import { ACCOUNT_REFERRAL_COOKIE, referralCookieHeader } from "@/modules/referral/cookie";

export async function GET(request: Request, { params }: { params: Promise<{ referrer: string }> }) {
  const { referrer } = await params;
  const visit = await getContainer().accountReferralAttribution.visit(
    referrer,
    accountReferralSource(request),
  );
  if (!visit) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, {
    status: 307,
    headers: {
      location: "/register",
      "Set-Cookie": referralCookieHeader(ACCOUNT_REFERRAL_COOKIE, visit.source),
    },
  });
}
