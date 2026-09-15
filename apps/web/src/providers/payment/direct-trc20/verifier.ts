import { TronGridClient, TronProtocolError, normalizeTronAddress } from "@cliqero/tron";
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

/** Cliqero adapter: translates generic TRON facts into Direct TRC20 observations. */
export class HttpDirectTrc20Verifier implements DirectTrc20Verifier {
  private readonly client: TronGridClient;

  constructor(
    config: DirectTrc20HttpConfiguration,
    http: (input: string | URL, init?: RequestInit) => Promise<Response> = fetch,
  ) {
    this.client = new TronGridClient({
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
      http,
    });
  }

  async verify(input: {
    transactionHash: string;
    network: DirectTrc20Network;
    destination: string;
    tokenContract: string;
  }): Promise<DirectTrc20Transfer> {
    let observation;
    try {
      observation = await this.client.inspectTransaction(input.transactionHash);
    } catch (error) {
      if (error instanceof TronProtocolError)
        throw new ProviderOperationError(
          "direct_usdt",
          "transaction.verify",
          undefined,
          undefined,
          "Verification transport failure",
          undefined,
          "ambiguous",
        );
      throw error;
    }
    if (!observation.exists)
      return {
        transactionHash: input.transactionHash,
        network: input.network,
        destination: input.destination,
        asset: "USDT",
        amountBaseUnits: 0n,
        confirmations: 0,
        status: "not_found",
      };

    const transferEvents = observation.transfers;
    const contractEvents = transferEvents.filter(
      (item) =>
        normalizeTronAddress(item.contractAddress) === normalizeTronAddress(input.tokenContract),
    );
    const destinationEvents = contractEvents.filter(
      (item) => normalizeTronAddress(item.destination) === normalizeTronAddress(input.destination),
    );
    const event = destinationEvents[0] ?? contractEvents[0] ?? transferEvents[0];
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
      destination: event?.destination ?? "",
      asset: "USDT",
      amountBaseUnits: event?.amountBaseUnits ?? 0n,
      ...(observation.timestamp === undefined ? {} : { timestamp: observation.timestamp }),
      confirmations: observation.confirmations,
      status: observation.status,
      ...(issue ? { issue } : {}),
    };
  }
}

export { normalizeTronAddress } from "@cliqero/tron";
