import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { FundingRepository } from "@/modules/funding/funding";
import type { NowPaymentsProvider } from "./provider";

export type NowPaymentsIpnDisposition =
  "pending" | "confirmed" | "failed" | "reconciliation_required";

type NowPaymentsIpnPayload = {
  orderId: string;
  paymentId: string | null;
  paymentStatus: string | null;
};

export type NowPaymentsIpnResponse = {
  status: 202 | 204 | 400 | 401 | 404 | 409;
  disposition?: NowPaymentsIpnDisposition;
};

/** Provider-owned raw-body IPN adapter. It never confirms funding directly. */
export class NowPaymentsIpnIngress {
  constructor(
    private readonly provider: NowPaymentsProvider,
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

function parseIpnPayload(rawBody: Uint8Array): NowPaymentsIpnPayload | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.order_id !== "string" || value.order_id.length === 0)
    return null;
  const paymentId =
    value.payment_id === undefined || value.payment_id === null
      ? null
      : typeof value.payment_id === "string" || typeof value.payment_id === "number"
        ? String(value.payment_id)
        : null;
  if (value.payment_id !== undefined && value.payment_id !== null && !paymentId) return null;
  const paymentStatus =
    value.payment_status === undefined || value.payment_status === null
      ? null
      : typeof value.payment_status === "string" && value.payment_status.trim().length > 0
        ? value.payment_status
        : null;
  if (value.payment_status !== undefined && value.payment_status !== null && !paymentStatus)
    return null;
  return { orderId: value.order_id, paymentId, paymentStatus };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
