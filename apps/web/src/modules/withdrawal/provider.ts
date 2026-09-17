import type { Money } from "@/modules/money/money";
import type { Withdrawal } from "./withdrawal";
import { ProviderConfigurationError, ProviderUnavailableError } from "@/kernel/provider-error";

export type PayoutFailureCategory =
  | "retryable_technical"
  | "permanent_validation"
  | "provider_rejection"
  | "unknown"
  | "authenticated_provider_failure";
export type PayoutResult =
  | {
      kind: "succeeded";
      providerReference: string;
      providerTransactionReference?: string;
      amount: Money;
      currency: string;
      metadata?: unknown;
    }
  | {
      kind: "failed";
      providerReference?: string;
      category: Exclude<PayoutFailureCategory, "unknown">;
      reason: string;
      metadata?: unknown;
    }
  | { kind: "unknown" | "pending"; providerReference?: string; reason: string; metadata?: unknown };
export interface PayoutProviderCapabilities {
  currencies: readonly string[];
  destinationTypes: readonly ("bank" | "manual")[];
  supportsVerification: boolean;
}
export interface PayoutProvider {
  readonly name: string;
  readonly capabilities: PayoutProviderCapabilities;
  submitPayout(input: { withdrawal: Withdrawal; idempotencyKey: string }): Promise<PayoutResult>;
  verifyPayout(input: { providerReference: string; withdrawal: Withdrawal }): Promise<PayoutResult>;
}
export class PayoutProviderRegistry {
  private providers = new Map<string, PayoutProvider>();
  private factories = new Map<string, () => PayoutProvider | null>();
  private failures = new Map<string, ProviderConfigurationError>();
  register(provider: PayoutProvider) {
    this.providers.set(provider.name, provider);
    this.factories.delete(provider.name);
    this.failures.delete(provider.name);
    return this;
  }
  registerLazy(
    name: string,
    factory: () => PayoutProvider | null,
    options?: { onFailure?: (error: ProviderConfigurationError) => void },
  ) {
    this.providers.delete(name);
    this.failures.delete(name);
    this.factories.set(name, () => {
      try {
        const provider = factory();
        if (!provider) return null;
        if (provider.name !== name)
          throw new Error(`Provider name does not match lazy registration: ${name}`);
        return provider;
      } catch (error) {
        const configurationError =
          error instanceof ProviderConfigurationError
            ? error
            : new ProviderConfigurationError(
                name,
                `Payout provider configuration is invalid: ${name}: ${error instanceof Error ? error.message : "Provider configuration is invalid"}`,
                error,
              );
        this.factories.delete(name);
        this.failures.set(name, configurationError);
        options?.onFailure?.(configurationError);
        throw configurationError;
      }
    });
    return this;
  }
  registerFailure(name: string, error: unknown) {
    this.providers.delete(name);
    this.factories.delete(name);
    this.failures.set(
      name,
      error instanceof ProviderConfigurationError
        ? error
        : new ProviderConfigurationError(
            name,
            `Payout provider configuration is invalid: ${name}: ${error instanceof Error ? error.message : String(error)}`,
            error,
          ),
    );
    return this;
  }
  get(name: string) {
    const provider = this.providers.get(name) ?? this.materialize(name);
    const failure = this.failures.get(name);
    if (failure) throw failure;
    if (!provider) throw new ProviderUnavailableError(name);
    return provider;
  }
  private materialize(name: string) {
    const factory = this.factories.get(name);
    if (!factory) return undefined;
    const provider = factory();
    this.factories.delete(name);
    if (provider) this.register(provider);
    return provider;
  }
}

export class DevelopmentPayoutProvider implements PayoutProvider {
  readonly name = "development";
  readonly capabilities = {
    currencies: ["USD"],
    destinationTypes: ["bank", "manual"] as const,
    supportsVerification: true,
  };
  private readonly unknowns = new Set<string>();
  async submitPayout(input: {
    withdrawal: Withdrawal;
    idempotencyKey: string;
  }): Promise<PayoutResult> {
    const mode = input.withdrawal.destinationReference;
    if (mode.startsWith("dev:retry"))
      return {
        kind: "failed",
        category: "retryable_technical",
        reason: "Development retryable failure",
      };
    if (mode.startsWith("dev:permanent"))
      return {
        kind: "failed",
        category: "permanent_validation",
        reason: "Development permanent validation failure",
      };
    if (mode.startsWith("dev:unknown")) {
      this.unknowns.add(input.idempotencyKey);
      return {
        kind: "unknown",
        providerReference: `dev-payout-${input.withdrawal.id}`,
        reason: "Development response lost",
      };
    }
    return {
      kind: "succeeded",
      providerReference: `dev-payout-${input.withdrawal.id}`,
      amount: input.withdrawal.amount,
      currency: input.withdrawal.amount.currency,
    };
  }
  async verifyPayout(input: {
    providerReference: string;
    withdrawal: Withdrawal;
  }): Promise<PayoutResult> {
    if (
      input.providerReference === `dev-payout-${input.withdrawal.id}` &&
      input.withdrawal.destinationReference.startsWith("dev:unknown")
    )
      return {
        kind: "succeeded",
        providerReference: input.providerReference,
        amount: input.withdrawal.amount,
        currency: input.withdrawal.amount.currency,
      };
    return {
      kind: "unknown",
      providerReference: input.providerReference,
      reason: "Development payout is still indeterminate",
    };
  }
}
