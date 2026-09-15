import { describe, expect, it, vi } from "vitest";
import { normalizeTronAddress, TronGridClient } from "../src";

describe("TRON protocol client", () => {
  it("normalizes hexadecimal address forms without applying funding policy", () => {
    expect(normalizeTronAddress("0x" + "a".repeat(40))).toBe("41" + "a".repeat(40));
  });

  it("retrieves transaction, events, info, and latest block facts", async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ txID: "hash", raw_data: { timestamp: 1 } })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                event_name: "Transfer",
                contract_address: "contract",
                result: { to: "destination", value: "2000000" },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ blockNumber: 10, receipt: { result: "SUCCESS" } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ block_header: { raw_data: { number: 12 } } })),
      );
    const client = new TronGridClient({ apiBaseUrl: "https://tron.example", http });
    await expect(client.inspectTransaction("hash")).resolves.toMatchObject({
      status: "confirmed",
      confirmations: 3,
      transfers: [
        { contractAddress: "contract", destination: "destination", amountBaseUnits: 2000000n },
      ],
    });
    expect(http).toHaveBeenCalledTimes(4);
  });

  it("rejects a successful non-object response at the protocol boundary", async () => {
    const client = new TronGridClient({
      apiBaseUrl: "https://tron.example",
      http: vi.fn().mockResolvedValue(new Response(JSON.stringify([]))),
    });
    await expect(client.inspectTransaction("hash")).rejects.toMatchObject({
      name: "TronProtocolError",
    });
  });

  it("rejects an incomplete transfer event instead of inventing zero-valued facts", async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ txID: "hash" })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                event_name: "Transfer",
                contract_address: "contract",
                result: { to: "destination" },
              },
            ],
          }),
        ),
      );
    const client = new TronGridClient({ apiBaseUrl: "https://tron.example", http });
    await expect(client.inspectTransaction("hash")).rejects.toMatchObject({
      name: "TronProtocolError",
    });
  });
});
