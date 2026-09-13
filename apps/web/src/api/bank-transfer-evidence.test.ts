import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { POST } from "@/api/compat/wallet/fund/[id]/evidence/route";

const fundingId = "00000000-0000-4000-8000-000000000010";
const account = { id: "00000000-0000-4000-8000-000000000001" };

describe("bank-transfer evidence API", () => {
  it("accepts browser empty optional fields without treating them as values", async () => {
    const submit = vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000011",
      fundingId,
      state: "verification_pending" as const,
      createdAt: "2026-09-13T06:00:00.000Z",
    }));
    fixtures.container = {
      principalResolver: { resolve: vi.fn(async () => ({ account })) },
      bankTransferEvidence: { submit },
    };

    const response = await POST(
      new Request(`http://localhost/api/wallet/fund/${fundingId}/evidence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transfer_reference: "",
          proof_image_url: "",
          customer_note: "Local UI evidence test",
        }),
      }),
      { params: Promise.resolve({ id: fundingId }) },
    );

    expect(response.status).toBe(201);
    expect(submit).toHaveBeenCalledWith(account.id, fundingId, {
      transferReference: undefined,
      proofImageUrl: undefined,
      customerNote: "Local UI evidence test",
    });
  });
});
