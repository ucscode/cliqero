import { getContainer } from "@/infrastructure/container";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
function page(title: string, message: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export function fundingStatusUrl(fundingId: string) {
  const url = new URL("/dashboard/wallet/fund", siteConfig.url);
  url.searchParams.set("funding", fundingId);
  return url;
}

function redirectToFunding(fundingId: string) {
  return Response.redirect(fundingStatusUrl(fundingId), 303);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const reference = query.get("reference") ?? query.get("trxref");
  if (!reference || reference.length > 200)
    return page("Payment unavailable", "This payment callback is invalid.", 400);
  try {
    const container = getContainer();
    const funding = await container.funding.findByProviderReference("paystack", reference);
    if (funding) {
      if (funding.state === "confirmed") return redirectToFunding(funding.id);
      await container.database.transaction(async () => {
        const locked = await container.funding.findById(funding.id, { forUpdate: true });
        if (locked && locked.state === "awaiting_payment") {
          locked.state = "verification_pending";
          await container.funding.save(locked);
        }
      });
      return redirectToFunding(funding.id);
    }
    const payment = await container.payments.findByProviderReference("paystack", reference);
    if (!payment)
      return page("Payment unavailable", "We could not find this funding transaction.", 404);
    if (payment.state !== "verified") {
      payment.state = "verification_pending";
      await container.payments.save(payment);
    }
    return page("Payment processing", "This historical payment is being verified.");
  } catch {
    return page("Payment unavailable", "We could not complete this payment callback.", 400);
  }
}
