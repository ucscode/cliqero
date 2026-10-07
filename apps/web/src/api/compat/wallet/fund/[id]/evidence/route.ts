import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../../http";
import { getContainer } from "@/infrastructure/container";
import { PublicApplicationError } from "@/kernel/errors";

const schema = z
  .object({
    transfer_reference: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
    customer_note: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
  })
  .strict();

function emptyToUndefined(value: unknown) {
  return value === "" ? undefined : value;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ fundingId: string }> },
) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).fundingId;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Funding not found" }, { status: 404 });
  try {
    const container = getContainer();
    const funding = await container.funding.findById(id);
    if (!funding || funding.accountId !== account.id)
      return Response.json({ error: "Funding not found", code: "not_found" }, { status: 404 });
    if (funding.providerName !== "bank_transfer")
      throw new PublicApplicationError(
        "This funding provider does not accept bank-transfer evidence.",
        "unsupported_funding_operation",
        409,
      );
    const form = await request.formData();
    if (form.has("provider"))
      throw new PublicApplicationError(
        "The funding provider is determined by the saved funding transaction.",
        "provider_override_not_allowed",
        400,
      );
    const file = form.get("proof_file");
    if (file !== null && !(file instanceof File))
      throw new PublicApplicationError("Evidence file is invalid", "invalid_evidence", 400);
    const body = schema.parse({
      transfer_reference: form.get("transfer_reference"),
      customer_note: form.get("customer_note"),
    });
    if (!body.transfer_reference && !(file instanceof File))
      throw new PublicApplicationError(
        "Add a transfer reference or proof file before submitting.",
        "evidence_required",
        400,
      );
    const evidence = await container.bankTransferEvidence.submit(account.id, id, {
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
        transfer_reference: evidence.transferReference,
        customer_note: evidence.customerNote,
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
