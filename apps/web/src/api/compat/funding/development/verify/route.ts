import { z } from "zod";
import { apiError, authenticatedSessionAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";
const bodySchema = z.object({ funding_id: z.uuid() });

export function developmentFundingVerificationEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
}

export async function POST(request: Request) {
  if (!developmentFundingVerificationEnabled())
    return Response.json(
      { error: "Development funding verification is unavailable" },
      { status: 404 },
    );
  const account = await authenticatedSessionAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = bodySchema.parse(await request.json());
    const funding = await getContainer().funding.findById(body.funding_id);
    if (!funding || funding.accountId !== account.id || funding.providerName !== "development")
      return Response.json({ error: "Not found" }, { status: 404 });
    const confirmed = await getContainer().fundingVerification.process(funding.id);
    return Response.json({ funding_id: funding.id, state: confirmed?.state ?? funding.state });
  } catch (error) {
    return apiError(error);
  }
}
