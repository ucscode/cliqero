import { describe, expect, it, vi } from "vitest";
import bs58check from "bs58check";
import { normalizeTronAddress, TronGridClient } from "../src";

describe("TRON protocol client", () => {
  it("normalizes hexadecimal address forms without applying funding policy", () => {
    const address = "a".repeat(40);
    const canonical = `41${address}`;
    expect(normalizeTronAddress(`0x${address}`)).toBe(canonical);
    expect(normalizeTronAddress(`0x${"f".repeat(24)}${address}`)).toBe(canonical);
    expect(normalizeTronAddress(canonical)).toBe(canonical);
    expect(normalizeTronAddress(`${"f".repeat(24)}${address}`)).toBe(canonical);
  });

  it("normalizes valid TRON Base58Check and retains invalid input", () => {
    const payload = Buffer.from(`41${"ab".repeat(20)}`, "hex");
    const base58 = bs58check.encode(payload);
    expect(normalizeTronAddress(base58)).toBe(payload.toString("hex"));
    expect(normalizeTronAddress("  T-not-valid!  ")).toBe("T-not-valid!");
    expect(normalizeTronAddress(bs58check.encode(Buffer.alloc(21, 0x42)))).toBe(
      bs58check.encode(Buffer.alloc(21, 0x42)),
    );
    expect(normalizeTronAddress(bs58check.encode(Buffer.from([0x41, 0x01])))).toBe(
      bs58check.encode(Buffer.from([0x41, 0x01])),
    );
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
