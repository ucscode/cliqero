import { describe, expect, it } from "vitest";
import { HttpDirectTrc20Verifier, normalizeTronAddress } from "./verifier";

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

function transferEvent(overrides: Record<string, unknown>) {
  return {
    ...event(),
    ...overrides,
    result: { ...event().result, ...((overrides.result as object | undefined) ?? {}) },
  };
}

describe("HTTP direct TRC20 verifier", () => {
  it("normalizes Base58Check, hex, and ABI-padded TRON addresses for comparison", () => {
    const address = "TVX22re4mJPQt9wWM48jF7bfRSzmJWcBAV";
    expect(normalizeTronAddress(address)).toBe("41d66e8b50f5acdaca0aae620dbe0c1f9395456fd9");
    expect(normalizeTronAddress("0xd66e8b50f5acdaca0aae620dbe0c1f9395456fd9")).toBe(
      "41d66e8b50f5acdaca0aae620dbe0c1f9395456fd9",
    );
    expect(
      normalizeTronAddress("000000000000000000000000d66e8b50f5acdaca0aae620dbe0c1f9395456fd9"),
    ).toBe("41d66e8b50f5acdaca0aae620dbe0c1f9395456fd9");
    expect(
      normalizeTronAddress("0x000000000000000000000000d66e8b50f5acdaca0aae620dbe0c1f9395456fd9"),
    ).toBe("41d66e8b50f5acdaca0aae620dbe0c1f9395456fd9");
    expect(normalizeTronAddress(`${address.slice(0, -1)}X`)).toBe(`${address.slice(0, -1)}X`);
  });

  it("accepts a Base58-configured wallet when TRONGrid returns a hex recipient", async () => {
    const inputWithBase58Wallet = {
      ...input,
      destination: "TVX22re4mJPQt9wWM48jF7bfRSzmJWcBAV",
      tokenContract: "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs",
    };
    const verifier = new HttpDirectTrc20Verifier(
      { ...config, tokenContract: inputWithBase58Wallet.tokenContract },
      async (url) => {
        if (String(url).includes("gettransactionbyid"))
          return response({ txID: input.transactionHash, raw_data: { timestamp: Date.now() } });
        if (String(url).includes("/events"))
          return response({
            data: [
              transferEvent({
                contract_address: inputWithBase58Wallet.tokenContract,
                result: {
                  to: "0xd66e8b50f5acdaca0aae620dbe0c1f9395456fd9",
                },
              }),
            ],
          });
        if (String(url).includes("gettransactioninfobyid"))
          return response({ blockNumber: 100, receipt: { result: "SUCCESS" } });
        return response({ block_header: { raw_data: { number: 105 } } });
      },
    );
    const result = await verifier.verify({ ...inputWithBase58Wallet });
    expect(result).toMatchObject({
      status: "confirmed",
      destination: "0xd66e8b50f5acdaca0aae620dbe0c1f9395456fd9",
    });
    expect(result).not.toHaveProperty("issue");
  });

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

  it("preserves the transaction timestamp and detects token issues before confirmation", async () => {
    const timestamp = Date.parse("2026-09-14T11:59:00.000Z");
    const verifier = new HttpDirectTrc20Verifier(config, async (url) => {
      if (String(url).includes("gettransactionbyid"))
        return response({ txID: input.transactionHash, raw_data: { timestamp } });
      if (String(url).includes("/events"))
        return response({ data: [transferEvent({ contract_address: "WrongToken" })] });
      return response({});
    });
    await expect(verifier.verify(input)).resolves.toMatchObject({
      status: "pending",
      timestamp,
      issue: "wrong_token_contract",
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

  it("reports a confirmed wrong token contract as a mismatch", async () => {
    const verifier = new HttpDirectTrc20Verifier(config, async (url) => {
      if (String(url).includes("/events"))
        return response({ data: [transferEvent({ contract_address: "WrongToken" })] });
      if (String(url).includes("gettransactioninfobyid"))
        return response({ blockNumber: 100, receipt: { result: "SUCCESS" } });
      return response({ block_header: { raw_data: { number: 105 } } });
    });
    await expect(verifier.verify(input)).resolves.toMatchObject({
      status: "confirmed",
      issue: "wrong_token_contract",
    });
  });

  it("reports a confirmed wrong destination as a mismatch", async () => {
    const verifier = new HttpDirectTrc20Verifier(config, async (url) => {
      if (String(url).includes("/events"))
        return response({
          data: [transferEvent({ result: { to: "TOther" } })],
        });
      if (String(url).includes("gettransactioninfobyid"))
        return response({ blockNumber: 100, receipt: { result: "SUCCESS" } });
      return response({ block_header: { raw_data: { number: 105 } } });
    });
    await expect(verifier.verify(input)).resolves.toMatchObject({
      status: "confirmed",
      issue: "wrong_destination",
    });
  });

  it("does not call a confirmed transaction without a transfer a not-found transaction", async () => {
    const verifier = new HttpDirectTrc20Verifier(config, async (url) => {
      if (String(url).includes("gettransactionbyid"))
        return response({ txID: input.transactionHash, raw_data: {} });
      if (String(url).includes("/events")) return response({ data: [] });
      if (String(url).includes("gettransactioninfobyid"))
        return response({ blockNumber: 100, receipt: { result: "SUCCESS" } });
      return response({ block_header: { raw_data: { number: 105 } } });
    });
    await expect(verifier.verify(input)).resolves.toMatchObject({
      status: "confirmed",
      issue: "missing_transfer",
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
      { url: expect.stringContaining("/wallet/gettransactionbyid"), method: "POST" },
      { url: expect.stringContaining("only_confirmed=false"), method: "GET" },
      { url: expect.stringContaining("gettransactioninfobyid"), method: "POST" },
      { url: expect.stringContaining("getnowblock"), method: "POST" },
    ]);
  });
});
