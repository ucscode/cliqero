import type { Account } from "@/modules/identity/account";
import type { Capability } from "@/modules/identity/capabilities";

export interface OperatorBulkWorkflowDependencies {
  operators: { requireCapability(accountId: string, capability: Capability): Promise<unknown> };
  operatorAccountManagement: { delete(actorId: string, accountId: string): Promise<unknown> };
  operatorPurchases: { deleteForRoot(actorId: string, purchaseId: string): Promise<unknown> };
  operatorDistributions: {
    deleteForRoot(actorId: string, distributionId: string): Promise<unknown>;
  };
  operatorEarnings: { deleteForRoot(actorId: string, entryId: string): Promise<unknown> };
  earningsAdjustments: { deleteForRoot(actorId: string, adjustmentId: string): Promise<unknown> };
  withdrawals: { deleteByOperator(actorId: string, withdrawalId: string): Promise<unknown> };
  operatorTreasury: { deleteForRoot(actorId: string, entryId: string): Promise<unknown> };
  listingService: {
    deleteCatalogue(actor: Account, listingId: string): Promise<unknown>;
    deleteCatalogueForRoot(actor: Account, listingId: string): Promise<unknown>;
    setCatalogueState(
      actor: Account,
      listingId: string,
      state: "draft" | "published" | "archived",
    ): Promise<unknown>;
  };
  listingReviews: {
    moderate(actor: Account, reviewId: string, status: "approved" | "rejected"): Promise<unknown>;
    update(
      actor: Account,
      reviewId: string,
      input: { status: "approved" | "rejected" },
    ): Promise<unknown>;
    delete(actor: Account, reviewId: string): Promise<unknown>;
  };
  blog: {
    delete(postId: string): unknown;
    deleteCategoryForRoot(categoryId: string): unknown;
  };
  listingCategories: { deleteForRoot(categoryId: string, actorId: string): Promise<unknown> };
}

export type OperatorBulkCommand =
  | { resource: "accounts"; action: "delete"; ids: string[] }
  | {
      resource:
        | "purchases"
        | "distributions"
        | "earnings"
        | "earnings-adjustments"
        | "withdrawals"
        | "treasury";
      action: "delete";
      ids: string[];
    }
  | {
      resource: "listings";
      action: "set-state";
      state: "draft" | "published" | "archived";
      ids: string[];
    }
  | { resource: "listings"; action: "delete"; ids: string[] }
  | {
      resource: "reviews";
      action: "moderate";
      status: "approved" | "rejected";
      ids: string[];
    }
  | { resource: "reviews"; action: "delete"; ids: string[] }
  | {
      resource: "blog-posts" | "blog-categories" | "catalogue-categories";
      action: "delete";
      ids: string[];
    };

export type OperatorBulkOutcome = {
  succeeded: string[];
  failed: Array<{ id: string; message: string }>;
};

/** Executes UI-selected records server-side while preserving per-record outcomes. */
export class OperatorBulkWorkflow {
  constructor(private readonly container: OperatorBulkWorkflowDependencies) {}

  async execute(actor: Account, command: OperatorBulkCommand): Promise<OperatorBulkOutcome> {
    const requiredCapability: Capability =
      command.action === "delete"
        ? "system.root"
        : command.resource === "listings"
          ? "catalogue.manage"
          : "reviews.moderate";
    await this.container.operators.requireCapability(actor.id, requiredCapability);

    const outcome: OperatorBulkOutcome = { succeeded: [], failed: [] };
    for (const id of [...new Set(command.ids)]) {
      try {
        switch (command.resource) {
          case "accounts":
            await this.container.operatorAccountManagement.delete(actor.id, id);
            break;
          case "purchases":
            await this.container.operatorPurchases.deleteForRoot(actor.id, id);
            break;
          case "distributions":
            await this.container.operatorDistributions.deleteForRoot(actor.id, id);
            break;
          case "earnings":
            await this.container.operatorEarnings.deleteForRoot(actor.id, id);
            break;
          case "earnings-adjustments":
            await this.container.earningsAdjustments.deleteForRoot(actor.id, id);
            break;
          case "withdrawals":
            await this.container.withdrawals.deleteByOperator(actor.id, id);
            break;
          case "treasury":
            await this.container.operatorTreasury.deleteForRoot(actor.id, id);
            break;
          case "listings":
            if (command.action === "delete") {
              await this.container.listingService.deleteCatalogueForRoot(actor, id);
            } else {
              await this.container.listingService.setCatalogueState(actor, id, command.state);
            }
            break;
          case "reviews":
            if (command.action === "delete") {
              await this.container.listingReviews.delete(actor, id);
            } else {
              await this.container.listingReviews.update(actor, id, { status: command.status });
            }
            break;
          case "blog-posts":
            this.container.blog.delete(id);
            break;
          case "blog-categories":
            this.container.blog.deleteCategoryForRoot(id);
            break;
          case "catalogue-categories":
            await this.container.listingCategories.deleteForRoot(id, actor.id);
            break;
        }
        outcome.succeeded.push(id);
      } catch (error) {
        outcome.failed.push({
          id,
          message: error instanceof Error ? error.message : "Unable to complete this action.",
        });
      }
    }
    return outcome;
  }
}
