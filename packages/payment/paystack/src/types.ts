export type PaystackHttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface PaystackClientOptions {
  secretKey: string;
  apiBaseUrl: string;
  http?: PaystackHttpClient;
}

export interface InitializeTransactionInput {
  email: string;
  amountMinor: string;
  currency: string;
  reference: string;
  callbackUrl?: string;
}

export interface InitializeTransactionResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface TransactionResult {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  fees?: number | null;
}

export interface CreateTransferRecipientInput {
  name: string;
  accountNumber: string;
  bankCode: string;
  currency: string;
}

export interface CreateTransferRecipientResult {
  recipient_code: string;
  active?: boolean;
}

export interface SubmitTransferInput {
  amountMinor: string;
  recipientCode: string;
  reference: string;
  reason: string;
  currency: string;
}

export interface TransferResult {
  reference: string;
  transfer_code?: string;
  status: string;
  amount: number;
  currency: string;
}
