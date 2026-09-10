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
    url.search = new URLSearchParams({ limit: "200" }).toString();
    const body = await this.request(url);
    const events = Array.isArray(body.data) ? body.data : [];
    const event = events.find(
      (item: any) =>
        String(item.contract_address ?? item.contractAddress ?? "").toLowerCase() ===
          input.tokenContract.toLowerCase() &&
        String(item.result?.to ?? item.result?.to_address ?? "").toLowerCase() ===
          input.destination.toLowerCase(),
    );
    const confirmed = body.meta?.at ?? body.meta?.fingerprint;
    if (!event)
      return {
        transactionHash: input.transactionHash,
        network: input.network,
        destination: input.destination,
        asset: "USDT",
        amountBaseUnits: 0n,
        confirmations: 0,
        status: confirmed ? "failed" : "not_found",
      };
    return {
      transactionHash: input.transactionHash,
      network: input.network,
      destination: String(event.result?.to ?? event.result?.to_address ?? ""),
      asset: "USDT",
      amountBaseUnits: BigInt(String(event.result?.value ?? event.result?.amount ?? "0")),
      confirmations: confirmed ? 1 : 0,
      status: confirmed ? "confirmed" : "pending",
    };
  }

  private async request(url: URL): Promise<any> {
    let response: Response;
    try {
      response = await this.http(url, {
        headers:
          this.config.provider === "trongrid" && this.config.apiKey
            ? { "TRON-PRO-API-KEY": this.config.apiKey }
            : undefined,
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
