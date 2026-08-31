import { createHash } from "node:crypto";
import type { Id } from "@/kernel/ids";
import type { Money } from "@/modules/money/money";

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
  providerInitialization?: { authorizationUrl?: string; accessCode?: string };
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
  /** Currencies this provider collects in; this is distinct from canonical listing currency. */
  readonly collectionCurrencies?: readonly string[];
  readonly referenceFor?: (input: { paymentId: Id; idempotencyKey: string }) => string;
  initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
  }): Promise<PaymentInitialization>;
  verify(input: { reference: string; expectedAmount: Money }): Promise<PaymentVerification>;
}
export interface PaymentProviderFilters {
  countries: string[] | null;
  currencies: string[] | null;
}
export interface PaymentProviderEligibilityContext {
  country: string | null;
  currency: string;
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
      currencies: options?.filters?.currencies ?? null,
    };
    const enabled = options?.enabled ?? true;
    this.providers.set(provider.name, {
      provider,
      enabled,
      filters,
      isEligible: (context) =>
        enabled &&
        (filters.countries === null ||
          (context.country !== null && filters.countries.includes(context.country))) &&
        (filters.currencies === null || filters.currencies.includes(context.currency)),
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
  availableFor(context: PaymentProviderEligibilityContext) {
    return [...this.providers.values()]
      .filter((registration) => registration.isEligible(context))
      .map((registration) => registration.provider);
  }
}
export class DevelopmentPaymentProvider implements PaymentProvider {
  readonly name = "development";
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
