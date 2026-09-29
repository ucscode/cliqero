import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import { PublicApplicationError } from "@/kernel/errors";

export type OperatorPaymentFilters = {
  provider?: string;
  state?: string;
  search?: string;
  limit: number;
  cursor?: string;
};

export interface OperatorPaymentReader {
  list(filters: OperatorPaymentFilters): Promise<{ items: any[]; nextCursor: string | null }>;
  get(paymentId: string): Promise<any | null>;
  listEvents(limit: number, provider?: string): Promise<any[]>;
}

/** Provider-neutral operator queries over persisted Cliqero payment facts. */
export class OperatorPaymentService {
  constructor(
    private readonly reader: OperatorPaymentReader,
    private readonly operators: OperatorAuthorizationService,
  ) {}

  async list(actorId: string, filters: OperatorPaymentFilters) {
    await this.operators.requireCapability(actorId, "finance.read");
    return this.reader.list(filters);
  }

  async get(actorId: string, paymentId: string) {
    await this.operators.requireCapability(actorId, "finance.read");
    const payment = await this.reader.get(paymentId);
    if (!payment) throw new PublicApplicationError("Payment not found.", "not_found", 404);
    return payment;
  }

  async events(actorId: string, input: { limit: number; provider?: string }) {
    await this.operators.requireCapability(actorId, "finance.read");
    return this.reader.listEvents(input.limit, input.provider);
  }
}
