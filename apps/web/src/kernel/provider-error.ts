export type ProviderFailureKind = "rejection" | "ambiguous";
export interface ProviderFailureDetails {
  amountMinor?: string;
  currency?: string;
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
    super("Payment initialization failed");
    this.name = "ProviderOperationError";
    this.kind = kind;
  }
}
