import { describe, expect, it } from "vitest";
import { HttpDirectTrc20Verifier } from "./verifier";

const baseUrl = "https://api.shasta.trongrid.io";
const config = {
  provider: "trongrid" as const,
  apiBaseUrl: baseUrl,
  tokenContract: "TToken",
};
const input = {
  transactionHash: "a".repeat(64),
  network: "TRC20" as const,
  destination: "TReceiver",
  tokenContract: "TToken",
};

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function event(value = "12500000") {
  return {
    event_name: "Transfer",
    contract_address: "TToken",
    result: { to: "TReceiver", value },
  };
}

describe("HTTP direct TRC20 verifier", () => {
  it("returns not_found when no matching transfer event exists", async () => {
    const verifier = new HttpDirectTrc20Verifier(config, async () => response({ data: [] }));
    await expect(verifier.verify(input)).resolves.toMatchObject({
      status: "not_found",
      confirmations: 0,
      amountBaseUnits: 0n,
    });
  });

  it("returns pending until the transaction is solidified", async () => {
    const verifier = new HttpDirectTrc20Verifier(config, async (url) => {
      if (String(url).includes("/events")) return response({ data: [event()] });
      return response({});
    });
    await expect(verifier.verify(input)).resolves.toMatchObject({
      status: "pending",
      confirmations: 0,
      amountBaseUnits: 12500000n,
    });
  });

  it("derives confirmations from the solidified block height", async () => {
    const verifier = new HttpDirectTrc20Verifier(config, async (url) => {
      if (String(url).includes("/events")) return response({ data: [event()] });
      if (String(url).includes("gettransactioninfobyid"))
        return response({ blockNumber: 100, receipt: { result: "SUCCESS" } });
      return response({ block_header: { raw_data: { number: 105 } } });
    });
    await expect(verifier.verify(input)).resolves.toMatchObject({
      status: "confirmed",
      confirmations: 6,
      amountBaseUnits: 12500000n,
    });
  });

  it("reports a failed transaction from the execution receipt", async () => {
    const verifier = new HttpDirectTrc20Verifier(config, async (url) => {
      if (String(url).includes("/events")) return response({ data: [event()] });
      return response({ blockNumber: 100, receipt: { result: "FAILED" } });
    });
    await expect(verifier.verify(input)).resolves.toMatchObject({
      status: "failed",
      confirmations: 0,
    });
  });

  it("preserves the API key and uses POST for receipt and block reads", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const verifier = new HttpDirectTrc20Verifier(
      { ...config, apiKey: "test-key" },
      async (url, init) => {
        calls.push({ url: String(url), method: init?.method ?? "GET" });
        if (String(url).includes("/events")) return response({ data: [event()] });
        if (String(url).includes("gettransactioninfobyid"))
          return response({ blockNumber: 100, receipt: { result: "SUCCESS" } });
        return response({ block_header: { raw_data: { number: 100 } } });
      },
    );
    await verifier.verify(input);
    expect(calls).toEqual([
      { url: expect.stringContaining("only_confirmed=false"), method: "GET" },
      { url: expect.stringContaining("gettransactioninfobyid"), method: "POST" },
      { url: expect.stringContaining("getnowblock"), method: "POST" },
    ]);
  });
});
