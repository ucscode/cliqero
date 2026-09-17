import type {
  PaymentProvider,
  PaymentProviderEligibilityContext,
  PaymentProviderFilters,
  PaymentProviderRegistration,
} from "./contracts";

export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProviderRegistration>();
  private readonly failures = new Map<string, Error>();

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
    this.failures.delete(provider.name);
    return this;
  }

  registerFailure(name: string, error: unknown): this {
    this.providers.delete(name);
    this.failures.set(name, error instanceof Error ? error : new Error(String(error)));
    return this;
  }

  collectionCurrency(name: string, requested?: string): string {
    const registration = this.providers.get(name);
    if (!registration || !registration.enabled)
      throw new Error(`Payment provider is unavailable: ${name}`);
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
    const registration = this.providers.get(name);
    const failure = this.failures.get(name);
    if (failure)
      throw new Error(`Payment provider configuration is invalid: ${name}: ${failure.message}`);
    if (!registration || !registration.enabled || (context && !registration.isEligible(context)))
      throw new Error(`Payment provider is unavailable: ${name}`);
    return registration.provider;
  }

  displayName(name: string) {
    return this.get(name).displayName;
  }

  customerActionLabel(name: string) {
    return this.get(name).customerActionLabel ?? "Create funding";
  }

  availableFor(context: PaymentProviderEligibilityContext) {
    return [...this.providers.values()]
      .filter((registration) => registration.isEligible(context))
      .map((registration) => registration.provider);
  }

  availableMethodsFor(context: PaymentProviderEligibilityContext) {
    return [...this.providers.values()]
      .filter((registration) => registration.isEligible(context))
      .map((registration) => {
        const currencies = registration.provider.collectionCurrenciesFor
          ? [...registration.provider.collectionCurrenciesFor({ country: context.country })]
          : [...(registration.provider.collectionCurrencies ?? ["USD"])];
        return {
          provider: registration.provider,
          collectionCurrency: currencies[0] ?? "USD",
          collectionCurrencies: currencies,
          paymentCurrencies: registration.provider.paymentCurrencies ?? [],
          customerActionLabel: registration.provider.customerActionLabel ?? "Create funding",
        };
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
}
