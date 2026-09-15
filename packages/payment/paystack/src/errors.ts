export class PaystackApiError extends Error {
  readonly status: number;
  readonly providerStatus?: boolean;
  readonly providerCode?: string;

  constructor(
    message: string,
    input: { status: number; providerStatus?: boolean; providerCode?: string },
  ) {
    super(message);
    this.name = "PaystackApiError";
    this.status = input.status;
    this.providerStatus = input.providerStatus;
    this.providerCode = input.providerCode;
  }
}

export class PaystackTransportError extends Error {
  readonly unknownOutcome: boolean;

  constructor(message: string, unknownOutcome = false) {
    super(message);
    this.name = "PaystackTransportError";
    this.unknownOutcome = unknownOutcome;
  }
}

export class PaystackResponseError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Paystack returned invalid JSON (${status})`);
    this.name = "PaystackResponseError";
    this.status = status;
  }
}
