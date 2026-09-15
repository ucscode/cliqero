export type NowPaymentsHttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface NowPaymentsClientOptions {
  apiKey: string;
  apiBaseUrl: string;
  http?: NowPaymentsHttpClient;
}

export interface MinimumAmountInput {
  currencyFrom: string;
  currencyTo: string;
  fiatEquivalent?: string;
}

export interface MinimumAmountResult {
  min_amount?: string | number | null;
  fiat_equivalent?: string | number | null;
}

export interface CreatePaymentInput {
  priceAmount: string;
  priceCurrency: string;
  payCurrency: string;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl?: string;
  sandboxCase?: string;
}

export interface PaymentResult {
  payment_id: string | number;
  payment_status: string;
  pay_address?: string | null;
  pay_amount?: string | number | null;
  pay_currency?: string | null;
  price_amount?: string | number | null;
  price_currency?: string | null;
  order_id?: string | null;
  expiration_estimate_date?: string | null;
  asset?: string | null;
  network?: string | null;
}

export interface NowPaymentsIpnPayload {
  orderId: string;
  paymentId: string | null;
  paymentStatus: string | null;
}
