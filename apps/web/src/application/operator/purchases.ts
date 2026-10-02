import { PublicApplicationError } from "@/kernel/errors";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { UnitOfWork } from "@/kernel/unit-of-work";

export type OperatorPurchaseQuery = {
  buyer?: string;
  listing?: string;
  state?: string;
  sort: "created";
  direction: "asc" | "desc";
  cursor?: string;
  limit: number;
};

export interface OperatorPurchaseReader {
  list(query: OperatorPurchaseQuery): Promise<{ items: any[]; nextCursor: string | null }>;
  get(purchaseId: string): Promise<any | null>;
  deleteForRoot(purchaseId: string, actorId: string): Promise<boolean>;
  listIdsForListing(listingId: string): Promise<string[]>;
}

/** Read-only finance operations over immutable purchase facts. */
export class OperatorPurchaseService {
  constructor(
    private readonly reader: OperatorPurchaseReader,
    private readonly operators: OperatorAuthorizationService,
    private readonly uow: UnitOfWork,
  ) {}

  async list(actorId: string, query: OperatorPurchaseQuery) {
    await this.operators.requireCapability(actorId, "finance.read");
    return this.reader.list(query);
  }

  async get(actorId: string, purchaseId: string) {
    await this.operators.requireCapability(actorId, "finance.read");
    const purchase = await this.reader.get(purchaseId);
    if (!purchase) throw new PublicApplicationError("Purchase not found.", "not_found", 404);
    return purchase;
  }

  async deleteForRoot(actorId: string, purchaseId: string) {
    await this.operators.requireCapability(actorId, "system.root");
    return this.uow.transaction(async () => {
      const purchase = await this.reader.get(purchaseId);
      if (!purchase) throw new PublicApplicationError("Purchase not found.", "not_found", 404);
      if (!(await this.reader.deleteForRoot(purchaseId, actorId)))
        throw new PublicApplicationError("Purchase not found.", "not_found", 404);
      return { id: purchaseId, deleted: true as const };
    });
  }

  async deleteForListing(actorId: string, listingId: string) {
    await this.operators.requireCapability(actorId, "system.root");
    return this.uow.transaction(async () => {
      const purchaseIds = await this.reader.listIdsForListing(listingId);
      for (const purchaseId of purchaseIds) await this.reader.deleteForRoot(purchaseId, actorId);
      return purchaseIds.length;
    });
  }
}
