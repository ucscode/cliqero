import { createHash } from "node:crypto";
import { ProviderOperationError } from "@/kernel/provider-error";

export type DirectTrc20Network = "TRC20";

export interface DirectTrc20Transfer {
  transactionHash: string;
  network: DirectTrc20Network;
  destination: string;
  asset: "USDT";
  amountBaseUnits: bigint;
  timestamp?: number;
  confirmations: number;
  status: "pending" | "confirmed" | "failed" | "not_found";
  issue?: "missing_transfer" | "wrong_token_contract" | "wrong_destination";
}

export interface DirectTrc20Verifier {
  verify(input: {
    transactionHash: string;
    network: DirectTrc20Network;
    destination: string;
    tokenContract: string;
  }): Promise<DirectTrc20Transfer>;
}

export interface DirectTrc20HttpConfiguration {
  provider: "trongrid";
  apiKey?: string;
  apiBaseUrl: string;
  tokenContract: string;
}

/** Small HTTP adapter for direct TRC20 transfer verification. */
export class HttpDirectTrc20Verifier implements DirectTrc20Verifier {
  constructor(
    private readonly config: DirectTrc20HttpConfiguration,
    private readonly http: (input: string | URL, init?: RequestInit) => Promise<Response> = fetch,
  ) {}

  async verify(input: {
    transactionHash: string;
    network: DirectTrc20Network;
    destination: string;
    tokenContract: string;
  }): Promise<DirectTrc20Transfer> {
    const url = new URL(
      `/v1/transactions/${encodeURIComponent(input.transactionHash)}/events`,
      this.config.apiBaseUrl,
    );
    url.search = new URLSearchParams({ limit: "200", only_confirmed: "false" }).toString();
    const transaction = await this.request(
      new URL("/wallet/gettransactionbyid", this.config.apiBaseUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: input.transactionHash }),
      },
    );
    const body = await this.request(url);
    const events = Array.isArray(body.data) ? body.data : [];
    const transferEvents = events.filter(
      (item: any) => String(item.event_name ?? item.eventName ?? "").toLowerCase() === "transfer",
    );
    const contractEvents = transferEvents.filter(
      (item: any) =>
        normalizeTronAddress(String(item.contract_address ?? item.contractAddress ?? "")) ===
        normalizeTronAddress(input.tokenContract),
    );
    const destinationEvents = contractEvents.filter(
      (item: any) =>
        normalizeTronAddress(String(item.result?.to ?? item.result?.to_address ?? "")) ===
        normalizeTronAddress(input.destination),
    );
    const event = destinationEvents[0] ?? contractEvents[0] ?? transferEvents[0];
    const transactionExists = hasTransaction(transaction);
    if (!event && !transactionExists)
      return {
        transactionHash: input.transactionHash,
        network: input.network,
        destination: input.destination,
        asset: "USDT",
        amountBaseUnits: 0n,
        confirmations: 0,
        status: "not_found",
      };

    const transactionInfo = await this.request(
      new URL("/walletsolidity/gettransactioninfobyid", this.config.apiBaseUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: input.transactionHash }),
      },
    );
    const blockNumber = parseBlockNumber(transactionInfo.blockNumber);
    const receiptResult = String(transactionInfo.receipt?.result ?? "").toUpperCase();
    const issue = !transferEvents.length
      ? "missing_transfer"
      : !contractEvents.length
        ? "wrong_token_contract"
        : !destinationEvents.length
          ? "wrong_destination"
          : undefined;
    const destination = String(event?.result?.to ?? event?.result?.to_address ?? "");
    const amountBaseUnits = parseAmount(event?.result?.value ?? event?.result?.amount);
    const timestamp = parseTimestamp(transaction);
    if (receiptResult === "FAILED")
      return {
        transactionHash: input.transactionHash,
        network: input.network,
        destination,
        asset: "USDT",
        amountBaseUnits,
        ...(timestamp === undefined ? {} : { timestamp }),
        confirmations: 0,
        status: "failed",
        ...(issue ? { issue } : {}),
      };
    if (blockNumber === null || receiptResult !== "SUCCESS")
      return {
        transactionHash: input.transactionHash,
        network: input.network,
        destination,
        asset: "USDT",
        amountBaseUnits,
        ...(timestamp === undefined ? {} : { timestamp }),
        confirmations: 0,
        status: "pending",
        ...(issue ? { issue } : {}),
      };

    const latestBlock = await this.request(
      new URL("/walletsolidity/getnowblock", this.config.apiBaseUrl),
      { method: "POST" },
    );
    const latestBlockNumber = parseBlockNumber(latestBlock.block_header?.raw_data?.number);
    const confirmations =
      latestBlockNumber === null ? 0 : Math.max(0, latestBlockNumber - blockNumber + 1);
    return {
      transactionHash: input.transactionHash,
      network: input.network,
      destination,
      asset: "USDT",
      amountBaseUnits,
      ...(timestamp === undefined ? {} : { timestamp }),
      confirmations,
      status: "confirmed",
      ...(issue ? { issue } : {}),
    };
  }

  private async request(url: URL, init?: RequestInit): Promise<any> {
    let response: Response;
    try {
      response = await this.http(url, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(this.config.provider === "trongrid" && this.config.apiKey
            ? { "TRON-PRO-API-KEY": this.config.apiKey }
            : {}),
        },
      });
    } catch {
      throw new ProviderOperationError(
        "direct_usdt",
        "transaction.verify",
        undefined,
        undefined,
        "Verification transport failure",
        undefined,
        "ambiguous",
      );
    }
    if (!response.ok) throw new Error("Verification service rejected request");
    try {
      return await response.json();
    } catch {
      throw new Error("Verification service returned invalid data");
    }
  }
}

/** Normalize TRON addresses for comparison without changing their display form. */
export function normalizeTronAddress(value: string): string {
  const trimmed = value.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return `41${trimmed.slice(2).toLowerCase()}`;
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return `41${trimmed.slice(-40).toLowerCase()}`;
  if (/^41[0-9a-fA-F]{40}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return `41${trimmed.slice(-40).toLowerCase()}`;
  if (trimmed.startsWith("T")) {
    const decoded = decodeBase58(trimmed);
    if (decoded.length === 25 && decoded[0] === 0x41 && isValidBase58Check(decoded))
      return Buffer.from(decoded.subarray(0, 21)).toString("hex");
  }
  return trimmed;
}

function isValidBase58Check(value: Uint8Array) {
  const payload = value.subarray(0, -4);
  const checksum = value.subarray(-4);
  const digest = createHash("sha256")
    .update(createHash("sha256").update(payload).digest())
    .digest();
  return checksum.every((byte, index) => byte === digest[index]);
}

function decodeBase58(value: string): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return new Uint8Array();
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) {
    bytes.unshift(Number(number & 0xffn));
    number >>= 8n;
  }
  for (let index = 0; index < value.length && value[index] === "1"; index++) bytes.unshift(0);
  return Uint8Array.from(bytes);
}

function parseTimestamp(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const transaction = value as { timestamp?: unknown; raw_data?: { timestamp?: unknown } };
  const timestamp = transaction.raw_data?.timestamp ?? transaction.timestamp;
  if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0)
    return timestamp;
  if (typeof timestamp === "string" && /^\d+$/.test(timestamp)) {
    const parsed = Number(timestamp);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function hasTransaction(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const transaction = value as {
    txID?: unknown;
    txid?: unknown;
    raw_data?: unknown;
    ret?: unknown;
  };
  return (
    (typeof transaction.txID === "string" && transaction.txID.length > 0) ||
    (typeof transaction.txid === "string" && transaction.txid.length > 0) ||
    (Boolean(transaction.raw_data) && typeof transaction.raw_data === "object") ||
    Array.isArray(transaction.ret)
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
