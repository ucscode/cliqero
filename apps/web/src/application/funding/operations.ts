import { PublicApplicationError } from "@/kernel/errors";
import type { FundingService } from "./service";
import type {
  BankTransferEvidenceInput,
  BankTransferEvidenceService,
} from "./bank-transfer/evidence";
import type { FundingRepository } from "@/modules/funding/funding";
import type { PaymentProviderRegistry } from "@/modules/payment";

/** Dispatches funding subresource operations using persisted provider capabilities. */
export class FundingOperationsService {
  constructor(
    private readonly funding: FundingRepository,
    private readonly providers: PaymentProviderRegistry,
    private readonly evidence: BankTransferEvidenceService,
    private readonly fundingService: FundingService,
  ) {}

  async submitEvidence(accountId: string, fundingId: string, input: BankTransferEvidenceInput) {
    const funding = await this.ownedFunding(accountId, fundingId);
    if (!this.supports(funding.providerName, "evidence")) throw unsupported("Evidence");
    return this.evidence.submit(accountId, fundingId, input);
  }

  async submitProviderTransaction(accountId: string, fundingId: string, payload: unknown) {
    const funding = await this.ownedFunding(accountId, fundingId);
    if (!this.supports(funding.providerName, "providerTransaction"))
      throw unsupported("Provider transaction identity");
    return this.fundingService.submitProviderRequest({ accountId, fundingId, payload });
  }

  private async ownedFunding(accountId: string, fundingId: string) {
    const funding = await this.funding.findById(fundingId);
    if (!funding || funding.accountId !== accountId)
      throw new PublicApplicationError("Funding not found", "not_found", 404);
    return funding;
  }

  private supports(providerName: string, operation: "evidence" | "providerTransaction") {
    try {
      return this.providers.supportsFundingOperation(providerName, operation);
    } catch {
      return false;
    }
  }
}

function unsupported(subject: string) {
  return new PublicApplicationError(
    `This funding provider does not accept ${subject.toLowerCase()}.`,
    "unsupported_funding_operation",
    409,
  );
}
