export type TronHttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface TronClientOptions {
  apiBaseUrl: string;
  apiKey?: string;
  http?: TronHttpClient;
}

export interface TronTransferEvent {
  contractAddress: string;
  destination: string;
  amountBaseUnits: bigint;
}

export interface TronTransactionObservation {
  exists: boolean;
  status: "not_found" | "pending" | "confirmed" | "failed";
  transactionHash: string;
  transfers: readonly TronTransferEvent[];
  timestamp?: number;
  blockNumber?: number;
  latestBlockNumber?: number;
  confirmations: number;
}
