export type ProviderFailureKind = "rejection" | "ambiguous";
export interface ProviderFailureDetails {
  amountMinor?: string;
  currency?: string;
}

export class ProviderConfigurationError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

export class ProviderUnavailableError extends Error {
  constructor(readonly provider: string) {
    super(`Payment provider is unavailable: ${provider}`);
    this.name = "ProviderUnavailableError";
  }
}

export function isProviderConfigurationFailure(
  error: unknown,
): error is ProviderConfigurationError | ProviderUnavailableError {
  return error instanceof ProviderConfigurationError || error instanceof ProviderUnavailableError;
}

export class ProviderOperationError extends Error {
  readonly kind: ProviderFailureKind;
  constructor(
    readonly provider: string,
    readonly operation: string,
    readonly httpStatus: number | undefined,
    readonly providerStatus: boolean | undefined,
    readonly providerMessage: string,
    readonly providerCode?: string,
    kind: ProviderFailureKind = "rejection",
    readonly details?: ProviderFailureDetails,
  ) {
    super(providerMessage || "Payment provider operation failed");
    this.name = "ProviderOperationError";
    this.kind = kind;
  }
}
