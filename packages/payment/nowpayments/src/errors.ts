export class NowPaymentsApiError extends Error {
  readonly status: number;
  readonly providerStatus?: boolean;
  readonly providerCode?: string;

  constructor(
    message: string,
    input: { status: number; providerStatus?: boolean; providerCode?: string },
  ) {
    super(message);
    this.name = "NowPaymentsApiError";
    this.status = input.status;
    this.providerStatus = input.providerStatus;
    this.providerCode = input.providerCode;
  }
}

export class NowPaymentsTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NowPaymentsTransportError";
  }
}

export class NowPaymentsResponseError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Invalid provider response");
    this.name = "NowPaymentsResponseError";
    this.status = status;
  }
}
