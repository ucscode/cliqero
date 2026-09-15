import { TronProtocolError } from "./errors";
import { z } from "zod";
import type { TronClientOptions, TronTransactionObservation, TronTransferEvent } from "./types";

export class TronGridClient {
  private readonly http: NonNullable<TronClientOptions["http"]>;
  private readonly baseUrl: string;

  constructor(private readonly options: TronClientOptions) {
    this.http = options.http ?? fetch;
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, "");
  }

  async inspectTransaction(transactionHash: string): Promise<TronTransactionObservation> {
    const transaction = await this.request("/wallet/gettransactionbyid", {
      method: "POST",
      body: JSON.stringify({ value: transactionHash }),
    });
    const eventsBody = await this.request(
      `/v1/transactions/${encodeURIComponent(transactionHash)}/events?limit=200&only_confirmed=false`,
    );
    if (!Array.isArray(eventsBody.data))
      throw new TronProtocolError("TRONGrid returned an invalid events payload");
    const transfers = parseTransfers(eventsBody);
    const exists = hasTransaction(transaction);
    if (!transfers.length && !exists)
      return {
        exists: false,
        status: "not_found",
        transactionHash,
        transfers,
        confirmations: 0,
      };

    const transactionInfo = await this.request("/walletsolidity/gettransactioninfobyid", {
      method: "POST",
      body: JSON.stringify({ value: transactionHash }),
    });
    const blockNumber = parseOptionalBlockNumber(transactionInfo.blockNumber);
    const receipt = transactionInfo.receipt;
    if (receipt !== undefined && !isRecord(receipt))
      throw new TronProtocolError("TRONGrid returned an invalid receipt payload");
    const receiptResult = receipt?.result;
    if (receiptResult !== undefined && typeof receiptResult !== "string")
      throw new TronProtocolError("TRONGrid returned an invalid receipt result");
    const normalizedReceiptResult = receiptResult?.toUpperCase() ?? "";
    const timestamp = parseTimestamp(transaction);
    if (normalizedReceiptResult === "FAILED")
      return {
        exists: true,
        status: "failed",
        transactionHash,
        transfers,
        ...(timestamp === undefined ? {} : { timestamp }),
        ...(blockNumber === null ? {} : { blockNumber }),
        confirmations: 0,
      };
    if (blockNumber === null || normalizedReceiptResult !== "SUCCESS")
      return {
        exists: true,
        status: "pending",
        transactionHash,
        transfers,
        ...(timestamp === undefined ? {} : { timestamp }),
        confirmations: 0,
      };

    const latestBlock = await this.request("/walletsolidity/getnowblock", {
      method: "POST",
    });
    const latestHeader = latestBlock.block_header;
    if (!isRecord(latestHeader) || !isRecord(latestHeader.raw_data))
      throw new TronProtocolError("TRONGrid returned an invalid latest block payload");
    const latestBlockNumber = parseOptionalBlockNumber(latestHeader.raw_data.number);
    if (latestBlockNumber === null)
      throw new TronProtocolError("TRONGrid returned an invalid latest block number");
    const confirmations =
      latestBlockNumber === null ? 0 : Math.max(0, latestBlockNumber - blockNumber + 1);
    return {
      exists: true,
      status: "confirmed",
      transactionHash,
      transfers,
      ...(timestamp === undefined ? {} : { timestamp }),
      blockNumber,
      ...(latestBlockNumber === null ? {} : { latestBlockNumber }),
      confirmations,
    };
  }

  private async request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    try {
      const response = await this.http(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(this.options.apiKey ? { "TRON-PRO-API-KEY": this.options.apiKey } : {}),
        },
      });
      if (!response.ok) throw new TronProtocolError("TRONGrid request failed");
      const parsed = z.record(z.string(), z.unknown()).safeParse(await response.json());
      if (!parsed.success) throw new TronProtocolError("TRONGrid returned invalid JSON");
      return parsed.data;
    } catch (error) {
      if (error instanceof TronProtocolError) throw error;
      throw new TronProtocolError("TRONGrid request failed");
    }
  }
}

function parseTransfers(body: Record<string, unknown>): TronTransferEvent[] {
  const events = Array.isArray(body.data) ? body.data : [];
  const transfers: TronTransferEvent[] = [];
  for (const item of events) {
    if (!isRecord(item)) continue;
    const eventName = item.event_name ?? item.eventName;
    if (typeof eventName !== "string" || eventName.toLowerCase() !== "transfer") continue;
    if (!isRecord(item.result))
      throw new TronProtocolError("TRONGrid returned an invalid transfer event");
    const destination = item.result.to ?? item.result.to_address;
    const amount = parseAmount(item.result.value ?? item.result.amount);
    const contractAddress = item.contract_address ?? item.contractAddress;
    if (
      typeof contractAddress !== "string" ||
      contractAddress.length === 0 ||
      typeof destination !== "string" ||
      destination.length === 0 ||
      amount === null
    )
      throw new TronProtocolError("TRONGrid returned an incomplete transfer event");
    transfers.push({ contractAddress, destination, amountBaseUnits: amount });
  }
  return transfers;
}

function parseTimestamp(value: Record<string, unknown>): number | undefined {
  const raw = (value.raw_data as Record<string, unknown> | undefined)?.timestamp ?? value.timestamp;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function hasTransaction(value: Record<string, unknown>) {
  return (
    (typeof value.txID === "string" && value.txID.length > 0) ||
    (typeof value.txid === "string" && value.txid.length > 0) ||
    (value.raw_data !== undefined && isRecord(value.raw_data)) ||
    Array.isArray(value.ret)
  );
}

function parseBlockNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

function parseAmount(value: unknown): bigint | null {
  return typeof value === "bigint" || (typeof value === "string" && /^\d+$/.test(value))
    ? BigInt(value)
    : typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? BigInt(value)
      : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalBlockNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return parseBlockNumber(value);
}
