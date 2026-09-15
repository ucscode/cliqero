import { parseIpnPayload } from "@cliqero/nowpayments";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { FundingRepository } from "@/modules/funding/funding";
import type { NowPaymentsIpnSignatureVerifier } from "./contracts";

export type NowPaymentsIpnDisposition =
  "pending" | "confirmed" | "failed" | "reconciliation_required";

export type NowPaymentsIpnResponse = {
  status: 202 | 204 | 400 | 401 | 404 | 409;
  disposition?: NowPaymentsIpnDisposition;
};

/** Provider-owned raw-body IPN adapter. It never confirms funding directly. */
export class NowPaymentsIpnIngress {
  constructor(
    private readonly provider: NowPaymentsIpnSignatureVerifier,
    private readonly funding: FundingRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async ingest(rawBody: Uint8Array, signature: string | null): Promise<NowPaymentsIpnResponse> {
    if (!this.provider.verifyIpnSignature(rawBody, signature)) return { status: 401 };
    const payload = parseIpnPayload(rawBody);
    if (!payload) return { status: 400 };
    const disposition = interpretIpnStatus(payload.paymentStatus);
    const funding =
      (payload.paymentId
        ? await this.funding.findByProviderTransactionId("nowpayments", payload.paymentId)
        : null) ?? (await this.funding.findByProviderReference("nowpayments", payload.orderId));
    if (!funding) return { status: 404, disposition };
    if (funding.providerReference !== payload.orderId) return { status: 409, disposition };
    if (
      payload.paymentId &&
      funding.providerTransactionId &&
      funding.providerTransactionId !== payload.paymentId
    )
      return { status: 409, disposition };
    if (funding.state === "confirmed" || funding.state === "failed" || funding.state === "expired")
      return { status: 204, disposition };
    await this.uow.transaction(async () => {
      const locked = await this.funding.findById(funding.id, { forUpdate: true });
      if (
        locked &&
        (locked.state === "awaiting_payment" || locked.state === "verification_pending")
      ) {
        if (payload.paymentId) locked.providerTransactionId = payload.paymentId;
        locked.state = "verification_pending";
        await this.funding.save(locked);
      }
    });
    return { status: 202, disposition };
  }
}

export function interpretIpnStatus(status: string | null): NowPaymentsIpnDisposition {
  const normalized = status?.toLowerCase() ?? null;
  if (normalized === "finished" || normalized === "confirmed") return "confirmed";
  if (
    normalized === "failed" ||
    normalized === "expired" ||
    normalized === "refunded" ||
    normalized === "partially_refunded"
  )
    return "failed";
  if (
    normalized === "waiting" ||
    normalized === "confirming" ||
    normalized === "sending" ||
    normalized === "partially_paid"
  )
    return "pending";
  return "reconciliation_required";
}
