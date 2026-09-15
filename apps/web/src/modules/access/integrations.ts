import type { Id } from "@/kernel/ids";
import type { IntegrationPrincipal } from "./access";

export class ScopedIntegration implements IntegrationPrincipal {
  constructor(
    readonly id: Id,
    readonly ownerId: Id,
    private readonly listingIds: ReadonlySet<Id>,
  ) {}

  canVerifyListing(listingId: Id): boolean {
    return this.listingIds.has(listingId);
  }
}

/** Application-facing integration credential contract. */
export interface IntegrationService {
  create(ownerId: Id, name: string, listingId: Id): Promise<{ id: Id; credential: string }>;
  createManaged(actorId: Id, name: string, listingId: Id): Promise<{ id: Id; credential: string }>;
}
