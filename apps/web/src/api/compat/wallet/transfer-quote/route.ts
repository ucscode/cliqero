import { getContainer } from "@/infrastructure/container";
import { authenticatedAccount, apiError } from "../../http";

export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const amount = url.searchParams.get("amount_minor");
  if ((from !== "funding" && from !== "earnings") || !amount || !/^[1-9]\d*$/.test(amount))
    return Response.json(
      { error: "A valid source balance and amount_minor are required." },
      { status: 400 },
    );
  try {
    const quote = getContainer().walletTransfers.quote(from, BigInt(amount));
    return Response.json(
      {
        gross_amount_minor: quote.grossMinor.toString(),
        fee_minor: quote.feeMinor.toString(),
        net_amount_minor: quote.netMinor.toString(),
        currency: "USD",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error, request);
  }
}
