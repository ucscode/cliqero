import { getContainer } from "@/infrastructure/container";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ referrer: string; listing: string }> },
) {
  const { referrer, listing } = await params;
  const visit = await getContainer().referralAttribution.visit(referrer, listing);
  if (!visit) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, {
    status: 307,
    headers: {
      location: `/listings/${encodeURIComponent(visit.listingId)}`,
      "Set-Cookie": `cliqero_attribution=${visit.source}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    },
  });
}
