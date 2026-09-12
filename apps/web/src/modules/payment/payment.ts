import { createHash } from "node:crypto";
import type { Id } from "@/kernel/ids";
import type { Money } from "@/modules/money/money";
import type { CurrencyMappingConfig } from "@/modules/money/country-currency";

export type PaymentState =
  | "pending"
  | "initialization_pending"
  | "initializing"
  | "awaiting_payment"
  | "verification_pending"
  | "verifying"
  | "initialization_failed"
  | "initialization_blocked"
  | "verification_blocked"
  | "reconciliation_pending"
  | "verified"
  | "failed";
export interface PaymentConversionSnapshot {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  source: string;
  sourceDate?: string;
  observedAt: Date;
}
export interface PaymentPreparation {
  collectionAmount: Money;
  paymentCurrency?: string;
  conversionSnapshot?: PaymentConversionSnapshot;
}
export interface PaymentFundingOption {
  id: string;
  collectionCurrency: string;
  fields: readonly { key: string; label: string; value: string }[];
}
export interface PaymentRecord {
  id: Id;
  providerName: string;
  providerReference: string;
  buyerId: Id;
  listingId: Id;
  /** Legacy alias retained for compatibility; new code should use collectionAmount. */
  amount: Money;
  collectionAmount?: Money;
  canonicalAmount: Money;
  state: PaymentState;
  idempotencyKey: string;
  providerTransactionId?: string;
  providerVerifiedPayload?: unknown;
  providerFee?: Money;
  /** Immutable quote used for a future canonical-to-collection conversion. */
  conversionSnapshot?: PaymentConversionSnapshot;
  providerInitialization?: PaymentInitializationMetadata;
}
export interface PaymentRepository {
  findById(id: Id, options?: { forUpdate?: boolean }): Promise<PaymentRecord | null>;
  findByProviderReference(providerName: string, reference: string): Promise<PaymentRecord | null>;
  findByIdempotencyKey(key: string): Promise<PaymentRecord | null>;
  save(payment: PaymentRecord): Promise<void>;
}
export interface PaymentInitialization {
  reference: string;
  authorizationUrl?: string;
  accessCode?: string;
  metadata?: PaymentInitializationMetadata;
}

export interface PaymentCurrencyOption {
  code: string;
  label?: string;
  asset?: string;
  network?: string;
}

/** Provider instructions are persisted as opaque, non-secret funding metadata. */
export interface PaymentInitializationMetadata {
  providerDisplayName?: string;
  authorizationUrl?: string;
  accessCode?: string;
  providerPaymentId?: string;
  paymentAddress?: string;
  paymentAmount?: string;
  paymentCurrency?: string;
  asset?: string;
  network?: string;
  instructions?: string;
  expiresAt?: string;
  providerAccountId?: string;
  providerAccountSnapshot?: unknown;
  transactionHash?: string;
  failureCode?: string;
  failureMessage?: string;
  failureAmountMinor?: string;
  failureCurrency?: string;
}
export interface PaymentVerification {
  verified: boolean;
  reference: string;
  amount: Money;
  providerTransactionId?: string;
  providerFee?: Money;
  status: string;
}
export interface PaymentProvider {
  readonly name: string;
  readonly environmentOnly?: "development" | "test";
  readonly displayName: string;
  readonly imageUrl: string;
  readonly description: string;
  /** Currencies this provider collects in; this is distinct from canonical listing currency. */
  readonly collectionCurrencies?: readonly string[];
  /** Optional selectable currencies used to settle a collection. */
  readonly paymentCurrencies?: readonly PaymentCurrencyOption[];
  readonly defaultPaymentCurrency?: string;
  readonly currencyMapping?: CurrencyMappingConfig;
  readonly collectionCurrenciesFor?: (input: { country: string | null }) => readonly string[];
  readonly isEligible?: (context: PaymentProviderEligibilityContext) => boolean;
  /** Optional provider-specific preflight check for dynamic payment minimums. */
  readonly minimumPaymentAmount?: (input: {
    currencyFrom: string;
    currencyTo: string;
  }) => Promise<Money>;
  /** Optional provider-owned canonical-to-collection preparation. */
  readonly prepareFunding?: (input: {
    canonicalAmount: Money;
    collectionCurrency: string;
    paymentCurrency?: string;
    fundingOptionId?: string;
    country?: string | null;
  }) => Promise<PaymentPreparation>;
  readonly fundingOptions?: (input: { country: string | null }) => readonly PaymentFundingOption[];
  readonly referenceFor?: (input: { paymentId: Id; idempotencyKey: string }) => string;
  initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
    country?: string | null;
    paymentCurrency?: string;
    fundingOptionId?: string;
  }): Promise<PaymentInitialization>;
  verify(input: {
    reference: string;
    expectedAmount: Money;
    initialization?: PaymentInitializationMetadata;
  }): Promise<PaymentVerification>;
}
export interface PaymentProviderFilters {
  countries: string[] | null;
}
export interface PaymentProviderEligibilityContext {
  country: string | null;
}
export interface PaymentProviderRegistration {
  provider: PaymentProvider;
  enabled: boolean;
  filters: PaymentProviderFilters;
  isEligible(context: PaymentProviderEligibilityContext): boolean;
}
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProviderRegistration>();
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
    return "USD";
  }
  get(name: string, context?: PaymentProviderEligibilityContext): PaymentProvider {
    const registration = this.providers.get(name);
    if (!registration || !registration.enabled || (context && !registration.isEligible(context)))
      throw new Error(`Payment provider is unavailable: ${name}`);
    return registration.provider;
  }
  displayName(name: string) {
    return this.get(name).displayName;
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
          defaultPaymentCurrency: registration.provider.defaultPaymentCurrency,
        };
      });
  }

  paymentCurrency(name: string, requested?: string) {
    const provider = this.get(name);
    const currencies = provider.paymentCurrencies ?? [];
    if (!requested) return provider.defaultPaymentCurrency;
    if (currencies.length === 0)
      throw new Error(`Payment provider does not support selectable payment currency: ${name}`);
    const normalized = requested.trim().toLowerCase();
    const match = currencies.find((currency) => currency.code.toLowerCase() === normalized);
    if (!match) throw new Error(`Payment provider does not support payment currency: ${requested}`);
    return match.code;
  }
}

export function isDevelopmentProviderEnabled(environment = process.env.NODE_ENV) {
  return environment === "development" || environment === "test";
}

export function registerDevelopmentPaymentProvider(
  registry: PaymentProviderRegistry,
  environment = process.env.NODE_ENV,
) {
  if (isDevelopmentProviderEnabled(environment))
    registry.register(new DevelopmentPaymentProvider());
  return registry;
}

export class DevelopmentPaymentProvider implements PaymentProvider {
  readonly name = "development";
  readonly environmentOnly = "development" as const;
  readonly displayName = "Development";
  readonly imageUrl = "/images/payment/development.svg";
  readonly description = "Development-only funding for local testing.";
  readonly collectionCurrencies = ["USD"] as const;
  referenceFor(input: { paymentId: Id; idempotencyKey: string }) {
    const digest = createHash("sha256")
      .update(`${input.paymentId}:${input.idempotencyKey}`)
      .digest("hex")
      .slice(0, 24);
    return `dev_${digest}`;
  }
  async initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
  }) {
    return { reference: this.referenceFor(input) };
  }
  async verify(input: { reference: string; expectedAmount: Money }) {
    return {
      verified: input.reference.startsWith("dev_") && input.expectedAmount.minorAmount >= 0n,
      reference: input.reference,
      amount: input.expectedAmount,
      status: "success",
    };
  }
}
