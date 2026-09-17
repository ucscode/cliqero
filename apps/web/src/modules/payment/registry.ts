import type {
  PaymentProvider,
  PaymentProviderEligibilityContext,
  PaymentProviderFilters,
  PaymentProviderRegistration,
} from "./contracts";
import { ProviderConfigurationError, ProviderUnavailableError } from "@/kernel/provider-error";

export interface LazyPaymentProviderRegistration {
  provider: PaymentProvider;
  enabled?: boolean;
  filters?: Partial<PaymentProviderFilters>;
}

export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProviderRegistration>();
  private readonly factories = new Map<string, () => LazyPaymentProviderRegistration | null>();
  private readonly failures = new Map<string, ProviderConfigurationError>();

  register(
    provider: PaymentProvider,
    options?: { enabled?: boolean; filters?: Partial<PaymentProviderFilters> },
  ): this {
    const filters = {
      countries: options?.filters?.countries ?? null,
    };
    const enabled = options?.enabled ?? true;
    this.providers.set(provider.name, {
      provider,
      enabled,
      filters,
      isEligible: (context) =>
        enabled &&
        (provider.isEligible?.(context) ?? true) &&
        (filters.countries === null ||
          (context.country !== null && filters.countries.includes(context.country))),
    });
    this.factories.delete(provider.name);
    this.failures.delete(provider.name);
    return this;
  }

  registerLazy(
    name: string,
    factory: () => LazyPaymentProviderRegistration | null,
    options?: { onFailure?: (error: ProviderConfigurationError) => void },
  ): this {
    this.providers.delete(name);
    this.failures.delete(name);
    this.factories.set(name, () => {
      try {
        const registration = factory();
        if (!registration) return null;
        if (registration.provider.name !== name)
          throw new Error(`Provider name does not match lazy registration: ${name}`);
        return registration;
      } catch (error) {
        const configurationError =
          error instanceof ProviderConfigurationError
            ? error
            : new ProviderConfigurationError(
                name,
                `Payment provider configuration is invalid: ${name}: ${error instanceof Error ? error.message : "Provider configuration is invalid"}`,
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

  registerFailure(name: string, error: unknown): this {
    this.providers.delete(name);
    this.factories.delete(name);
    this.failures.set(
      name,
      error instanceof ProviderConfigurationError
        ? error
        : new ProviderConfigurationError(
            name,
            `Payment provider configuration is invalid: ${name}: ${error instanceof Error ? error.message : String(error)}`,
            error,
          ),
    );
    return this;
  }

  collectionCurrency(name: string, requested?: string): string {
    const registration = this.registration(name);
    const currencies = registration.provider.collectionCurrencies ?? [];
    if (requested) {
      const normalized = requested.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Payment collection currency is invalid");
      if (currencies.length > 0 && !currencies.includes(normalized))
        throw new Error(`Payment provider does not support collection currency: ${normalized}`);
      return normalized;
    }
    if (currencies.length === 1) return currencies[0];
    return registration.provider.defaultCollectionCurrency ?? currencies[0] ?? "USD";
  }

  get(name: string, context?: PaymentProviderEligibilityContext): PaymentProvider {
    const registration = this.registration(name);
    if (!registration.enabled || (context && !registration.isEligible(context)))
      throw new ProviderUnavailableError(name);
    return registration.provider;
  }

  has(name: string) {
    return this.providers.has(name) || this.factories.has(name);
  }

  displayName(name: string) {
    return this.get(name).displayName;
  }

  customerActionLabel(name: string) {
    return this.get(name).customerActionLabel ?? "Create funding";
  }

  availableFor(context: PaymentProviderEligibilityContext) {
    return this.providerNames().flatMap((name) => {
      try {
        return [this.get(name, context)];
      } catch {
        return [];
      }
    });
  }

  availableMethodsFor(context: PaymentProviderEligibilityContext) {
    return this.providerNames().flatMap((name) => {
      try {
        const provider = this.get(name, context);
        const currencies = provider.collectionCurrenciesFor
          ? [...provider.collectionCurrenciesFor({ country: context.country })]
          : [...(provider.collectionCurrencies ?? ["USD"])];
        return [
          {
            provider,
            collectionCurrency: currencies[0] ?? "USD",
            collectionCurrencies: currencies,
            paymentCurrencies: provider.paymentCurrencies ?? [],
            customerActionLabel: provider.customerActionLabel ?? "Create funding",
          },
        ];
      } catch {
        return [];
      }
    });
  }

  paymentCurrency(name: string, requested?: string) {
    const provider = this.get(name);
    const currencies = provider.paymentCurrencies ?? [];
    if (!requested) {
      if (currencies.length === 1) return currencies[0].code;
      if (currencies.length > 1)
        throw new Error(`Payment provider requires a payment currency selection: ${name}`);
      return undefined;
    }
    if (currencies.length === 0)
      throw new Error(`Payment provider does not support selectable payment currency: ${name}`);
    const normalized = requested.trim().toLowerCase();
    const match = currencies.find((currency) => currency.code.toLowerCase() === normalized);
    if (!match) throw new Error(`Payment provider does not support payment currency: ${requested}`);
    return match.code;
  }

  private registration(name: string): PaymentProviderRegistration {
    const existing = this.providers.get(name);
    if (existing) return existing;
    const failure = this.failures.get(name);
    if (failure) throw failure;
    const factory = this.factories.get(name);
    if (factory) {
      const registration = factory();
      this.factories.delete(name);
      if (registration) {
        this.register(registration.provider, registration);
        return this.providers.get(name)!;
      }
    }
    throw new ProviderUnavailableError(name);
  }

  private providerNames() {
    return [...new Set([...this.providers.keys(), ...this.factories.keys()])];
  }
}
