import { TronProtocolError } from "./errors";
import type { TronClientOptions, TronTransactionObservation, TronTransferEvent } from "./types";

export class TronGridClient {
  private readonly http: NonNullable<TronClientOptions["http"]>;
  private readonly baseUrl: string;

  constructor(private readonly options: TronClientOptions) {
    this.http = options.http ?? fetch;
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, "");
  }

  async inspectTransaction(transactionHash: string): Promise<TronTransactionObservation> {
    const transaction = await this.request<Record<string, unknown>>("/wallet/gettransactionbyid", {
      method: "POST",
      body: JSON.stringify({ value: transactionHash }),
    });
    const eventsBody = await this.request<Record<string, unknown>>(
      `/v1/transactions/${encodeURIComponent(transactionHash)}/events?limit=200&only_confirmed=false`,
    );
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

    const transactionInfo = await this.request<Record<string, unknown>>(
      "/walletsolidity/gettransactioninfobyid",
      {
        method: "POST",
        body: JSON.stringify({ value: transactionHash }),
      },
    );
    const blockNumber = parseBlockNumber(transactionInfo.blockNumber);
    const receiptResult = String(
      (transactionInfo.receipt as Record<string, unknown> | undefined)?.result ?? "",
    ).toUpperCase();
    const timestamp = parseTimestamp(transaction);
    if (receiptResult === "FAILED")
      return {
        exists: true,
        status: "failed",
        transactionHash,
        transfers,
        ...(timestamp === undefined ? {} : { timestamp }),
        ...(blockNumber === null ? {} : { blockNumber }),
        confirmations: 0,
      };
    if (blockNumber === null || receiptResult !== "SUCCESS")
      return {
        exists: true,
        status: "pending",
        transactionHash,
        transfers,
        ...(timestamp === undefined ? {} : { timestamp }),
        confirmations: 0,
      };

    const latestBlock = await this.request<Record<string, unknown>>("/walletsolidity/getnowblock", {
      method: "POST",
    });
    const latestBlockNumber = parseBlockNumber(
      (latestBlock.block_header as Record<string, unknown> | undefined)?.raw_data &&
        ((latestBlock.block_header as Record<string, unknown>).raw_data as Record<string, unknown>)
          .number,
    );
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

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      const response = await this.http(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(this.options.apiKey ? { "TRON-PRO-API-KEY": this.options.apiKey } : {}),
        },
      });
      if (!response.ok) throw new TronProtocolError("TRONGrid request failed");
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof TronProtocolError) throw error;
      throw new TronProtocolError("TRONGrid request failed");
    }
  }
}

function parseTransfers(body: Record<string, unknown>): TronTransferEvent[] {
  const events = Array.isArray(body.data) ? body.data : [];
  return events
    .filter(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item === "object" &&
        String(item.event_name ?? item.eventName ?? "").toLowerCase() === "transfer",
    )
    .map((item) => {
      const result = item.result && typeof item.result === "object" ? item.result : {};
      const values = result as Record<string, unknown>;
      return {
        contractAddress: String(item.contract_address ?? item.contractAddress ?? ""),
        destination: String(values.to ?? values.to_address ?? ""),
        amountBaseUnits: parseAmount(values.value ?? values.amount),
      };
    });
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
    (Boolean(value.raw_data) && typeof value.raw_data === "object") ||
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

function parseAmount(value: unknown): bigint {
  return typeof value === "bigint" || (typeof value === "string" && /^\d+$/.test(value))
    ? BigInt(value)
    : typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? BigInt(value)
      : 0n;
}
