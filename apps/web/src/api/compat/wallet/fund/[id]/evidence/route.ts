import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../../http";
import { getContainer } from "@/infrastructure/container";

const schema = z
  .object({
    transfer_reference: z.string().max(200).optional(),
    proof_image_url: z.string().url().max(2048).optional(),
    customer_note: z.string().max(2000).optional(),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Funding not found" }, { status: 404 });
  try {
    const body = schema.parse(await request.json());
    const evidence = await getContainer().bankTransferEvidence.submit(account.id, id, {
      transferReference: body.transfer_reference,
      proofImageUrl: body.proof_image_url,
      customerNote: body.customer_note,
    });
    return Response.json(
      {
        id: evidence.id,
        funding_id: evidence.fundingId,
        state: evidence.state,
        created_at: evidence.createdAt,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
