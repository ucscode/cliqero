import type { Account } from "@/modules/identity/account";
import type { Capability } from "@/modules/identity/capabilities";

export interface OperatorBulkWorkflowDependencies {
  operators: { requireCapability(accountId: string, capability: Capability): Promise<unknown> };
  operatorAccountManagement: { delete(actorId: string, accountId: string): Promise<unknown> };
  listingService: {
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
    deleteCategory(categoryId: string): unknown;
  };
  listingCategories: { delete(categoryId: string): Promise<unknown> };
}

export type OperatorBulkCommand =
  | { resource: "accounts"; action: "delete"; ids: string[] }
  | {
      resource: "listings";
      action: "set-state";
      state: "draft" | "published" | "archived";
      ids: string[];
    }
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
    const requiredCapability: Record<OperatorBulkCommand["resource"], Capability> = {
      accounts: "accounts.manage",
      listings: "catalogue.manage",
      reviews: "reviews.moderate",
      "blog-posts": "content.manage",
      "blog-categories": "content.manage",
      "catalogue-categories": "catalogue.manage",
    };
    await this.container.operators.requireCapability(
      actor.id,
      requiredCapability[command.resource],
    );

    const outcome: OperatorBulkOutcome = { succeeded: [], failed: [] };
    for (const id of [...new Set(command.ids)]) {
      try {
        switch (command.resource) {
          case "accounts":
            await this.container.operatorAccountManagement.delete(actor.id, id);
            break;
          case "listings":
            await this.container.listingService.setCatalogueState(actor, id, command.state);
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
            this.container.blog.deleteCategory(id);
            break;
          case "catalogue-categories":
            await this.container.listingCategories.delete(id);
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
