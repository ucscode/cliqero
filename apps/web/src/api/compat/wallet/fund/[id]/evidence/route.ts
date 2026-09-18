import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../../http";
import { getContainer } from "@/infrastructure/container";

const schema = z
  .object({
    transfer_reference: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
    customer_note: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
  })
  .strict();

function emptyToUndefined(value: unknown) {
  return value === "" ? undefined : value;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Funding not found" }, { status: 404 });
  try {
    const form = await request.formData();
    const file = form.get("proof_file");
    if (file !== null && !(file instanceof File)) throw new Error("Evidence file is invalid");
    const body = schema.parse({
      transfer_reference: form.get("transfer_reference"),
      customer_note: form.get("customer_note"),
    });
    if (!body.transfer_reference && !(file instanceof File))
      throw new Error("Add a transfer reference or proof file before submitting.");
    const evidence = await getContainer().bankTransferEvidence.submit(account.id, id, {
      transferReference: body.transfer_reference,
      customerNote: body.customer_note,
      proofFile:
        file instanceof File
          ? {
              bytes: new Uint8Array(await file.arrayBuffer()),
              mimeType: file.type,
              filename: file.name,
            }
          : undefined,
    });
    return Response.json(
      {
        id: evidence.id,
        funding_id: evidence.fundingId,
        state: evidence.state,
        created_at: evidence.createdAt,
        proof: evidence.proof
          ? {
              original_filename: evidence.proof.originalFilename,
              mime_type: evidence.proof.mimeType,
              byte_size: evidence.proof.byteSize,
            }
          : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
