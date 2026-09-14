import { ProviderOperationError } from "@/kernel/provider-error";

export type DirectTrc20Network = "TRC20";

export interface DirectTrc20Transfer {
  transactionHash: string;
  network: DirectTrc20Network;
  destination: string;
  asset: "USDT";
  amountBaseUnits: bigint;
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
        String(item.contract_address ?? item.contractAddress ?? "").toLowerCase() ===
        input.tokenContract.toLowerCase(),
    );
    const destinationEvents = contractEvents.filter(
      (item: any) =>
        String(item.result?.to ?? item.result?.to_address ?? "").toLowerCase() ===
        input.destination.toLowerCase(),
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
    const destination = String(event?.result?.to ?? event?.result?.to_address ?? "");
    const amountBaseUnits = parseAmount(event?.result?.value ?? event?.result?.amount);
    if (receiptResult === "FAILED")
      return {
        transactionHash: input.transactionHash,
        network: input.network,
        destination,
        asset: "USDT",
        amountBaseUnits,
        confirmations: 0,
        status: "failed",
      };
    if (blockNumber === null || receiptResult !== "SUCCESS")
      return {
        transactionHash: input.transactionHash,
        network: input.network,
        destination,
        asset: "USDT",
        amountBaseUnits,
        confirmations: 0,
        status: "pending",
      };

    const latestBlock = await this.request(
      new URL("/walletsolidity/getnowblock", this.config.apiBaseUrl),
      { method: "POST" },
    );
    const latestBlockNumber = parseBlockNumber(latestBlock.block_header?.raw_data?.number);
    const confirmations =
      latestBlockNumber === null ? 0 : Math.max(0, latestBlockNumber - blockNumber + 1);
    const issue = !transferEvents.length
      ? "missing_transfer"
      : !contractEvents.length
        ? "wrong_token_contract"
        : !destinationEvents.length
          ? "wrong_destination"
          : undefined;
    return {
      transactionHash: input.transactionHash,
      network: input.network,
      destination,
      asset: "USDT",
      amountBaseUnits,
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
