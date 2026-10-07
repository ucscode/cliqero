import { describe, expect, it, vi } from "vitest";
import { FundingOperationsService } from "@/application/funding/operations";

const accountId = "00000000-0000-4000-8000-000000000001";
const fundingId = "00000000-0000-4000-8000-000000000010";

function service(capability: "evidence" | "providerTransaction" | null) {
  const evidence = { submit: vi.fn(async () => ({ id: "evidence" })) };
  const fundingService = { submitProviderRequest: vi.fn(async () => ({ id: fundingId })) };
  const funding = {
    findById: vi.fn(async () => ({
      id: fundingId,
      accountId,
      providerName: "configured-provider",
    })),
  };
  const providers = {
    supportsFundingOperation: vi.fn(
      (_provider: string, operation: string) => capability === operation,
    ),
  };
  return {
    subject: new FundingOperationsService(
      funding as never,
      providers as never,
      evidence as never,
      fundingService as never,
    ),
    evidence,
    fundingService,
    providers,
  };
}

describe("FundingOperationsService", () => {
  it("dispatches evidence based on the persisted provider capability", async () => {
    const { subject, evidence, providers } = service("evidence");
    const input = { transferReference: "bank-ref" };
    await subject.submitEvidence(accountId, fundingId, input);
    expect(providers.supportsFundingOperation).toHaveBeenCalledWith(
      "configured-provider",
      "evidence",
    );
    expect(evidence.submit).toHaveBeenCalledWith(accountId, fundingId, input);
  });

  it("dispatches provider transaction identity without accepting a client provider", async () => {
    const { subject, fundingService, providers } = service("providerTransaction");
    await subject.submitProviderTransaction(accountId, fundingId, { transaction_hash: "hash" });
    expect(providers.supportsFundingOperation).toHaveBeenCalledWith(
      "configured-provider",
      "providerTransaction",
    );
    expect(fundingService.submitProviderRequest).toHaveBeenCalledWith({
      accountId,
      fundingId,
      payload: { transaction_hash: "hash" },
    });
  });

  it("returns a stable conflict for unsupported provider capabilities", async () => {
    const { subject, evidence } = service(null);
    await expect(
      subject.submitEvidence(accountId, fundingId, { transferReference: "ref" }),
    ).rejects.toMatchObject({ code: "unsupported_funding_operation", status: 409 });
    expect(evidence.submit).not.toHaveBeenCalled();
  });
});
