import { newId } from "@/kernel/ids";
import type { ApplicationContainer } from "@/infrastructure/container";
import type { LifecycleDiagnosticWriter } from "@/kernel/diagnostics";
export interface CommercialWorkflowLogger {
  error(fields: Record<string, unknown>, message: string): void;
}
export class WorkerInfrastructureError extends Error {
  constructor(
    readonly family: string,
    cause: unknown,
  ) {
    super(errorMessage(cause), { cause });
    this.name = "WorkerInfrastructureError";
  }
}
const consoleLogger: CommercialWorkflowLogger = {
  error: (fields, message) =>
    console.error(
      JSON.stringify({ level: "error", message, ...fields, timestamp: new Date().toISOString() }),
    ),
};
export class CommercialWorkflowDispatcher {
  constructor(
    private app: ApplicationContainer,
    private logger: CommercialWorkflowLogger = consoleLogger,
    private diagnostics?: LifecycleDiagnosticWriter,
    private clock: () => Date = () => new Date(),
  ) {}
  async runOnce() {
    let processed = 0;
    processed += await this.family(
      "funding-expiry",
      () => this.app.fundingExpiry.findWork(),
      (item) => this.app.fundingExpiry.process(item.id),
    );
    processed += await this.family(
      "funding-verification",
      async () => {
        const work = this.app.funding.findVerificationWork
          ? await this.app.funding.findVerificationWork(this.clock())
          : await this.app.funding.findWork("verification_pending");
        return work.filter(
          (funding) => this.app.providers.get(funding.providerName).automatedVerification !== false,
        );
      },
      (item) => this.app.fundingVerification.process(item.id),
    );
    processed += await this.family(
      "wallet-credit",
      () => this.app.funding.findWork("confirmed"),
      (item) => this.app.walletCredit.process(item.id),
    );
    processed += await this.family(
      "wallet-availability",
      () => this.app.walletRepository.findPendingCredits(),
      (item) => this.app.walletAvailability.process(item.id),
    );
    processed += await this.family(
      "entitlement",
      async () => (await this.app.purchases.findCompletedWithoutEntitlement?.()) ?? [],
      (item) => this.app.entitlementIssuance.process(item.id),
    );
    processed += await this.family(
      "distribution",
      async () => (await this.app.purchases.findCompletedWithoutDistribution?.()) ?? [],
      (item) =>
        this.app.purchaseDistribution.process({ purchaseId: item.id, correlationId: newId() }),
    );
    processed += await this.family(
      "treasury",
      () => this.app.treasuryProcessor.findWork(),
      (item) => this.app.treasuryProcessor.process(item.id),
    );
    processed += await this.family(
      "listing-media-deletion",
      () => this.app.listingMediaDeletion.findWork(),
      (item) => this.app.listingMediaDeletion.process(item.id),
    );
    return processed;
  }
  private async family<T extends { id: string }>(
    family: string,
    discover: () => Promise<readonly T[]>,
    process: (item: T) => Promise<unknown>,
  ) {
    let processed = 0;
    let items: readonly T[];
    try {
      items = await discover();
    } catch (error) {
      if (isDatabaseUnavailable(error)) throw new WorkerInfrastructureError(family, error);
      this.failure(family, undefined, error, "commercial.workflow.discovery.failed");
      return 0;
    }
    for (const item of items) {
      try {
        await process(item);
        processed++;
      } catch (error) {
        if (isDatabaseUnavailable(error)) throw new WorkerInfrastructureError(family, error);
        this.failure(family, item.id, error, "commercial.workflow.item.failed");
      }
    }
    return processed;
  }
  private failure(family: string, workId: string | undefined, error: unknown, message: string) {
    this.diagnostics?.write({
      level: "error",
      event: "worker.workflow.failed",
      error,
      metadata: { processor_family: family, work_id: workId ?? null },
    });
    this.logger.error(
      {
        processor_family: family,
        work_id: workId,
        error: error instanceof Error ? error.message : String(error),
      },
      message,
    );
  }
}

function isDatabaseUnavailable(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (
    typeof code === "string" &&
    [
      "EAI_AGAIN",
      "ENOTFOUND",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "57P01",
      "57P02",
      "57P03",
      "08000",
      "08001",
      "08003",
      "08004",
      "08006",
      "08007",
      "08S01",
    ].includes(code)
  )
    return true;
  const message = errorMessage(error).toLowerCase();
  return /getaddrinfo|eai_again|enotfound|econnrefused|connection (terminated|refused|failed)|database system is starting up|terminating connection/.test(
    message,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
