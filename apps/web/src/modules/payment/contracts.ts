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
  initializationMetadata?: PaymentInitializationMetadata;
}
export type PaymentVerificationObservationStatus =
  | "awaiting_transaction"
  | "not_found"
  | "confirming"
  | "mismatch"
  | "failed"
  | "provider_error"
  | "success";
export type PaymentVerificationObservationLevel = "error" | "info" | "success";
export interface PaymentVerificationObservation {
  status: PaymentVerificationObservationStatus;
  message: string;
  /** Customer-safe severity for rendering the latest verification result. */
  level?: PaymentVerificationObservationLevel;
  checkedAt?: string;
  confirmations?: number;
  confirmationsRequired?: number;
}
export interface PaymentFundingOption {
  id: string;
  collectionCurrency: string;
  /** Optional provider-specific instruction captured with the funding snapshot. */
  instruction?: string;
  fields: readonly {
    key: string;
    label: string;
    value: string;
    copyable?: boolean;
  }[];
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
  /** Opaque external identity; preserve the provider-supplied text and casing. */
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
  /** Provider-side opaque identity; returned text and casing must be preserved exactly. */
  providerTransactionId?: string;
  authorizationUrl?: string;
  accessCode?: string;
  metadata?: PaymentInitializationMetadata;
}

export type PaymentResultState = "pending" | "confirmed" | "failed" | "reconciliation_required";

/** Provider output consumed by generic funding; provider status vocabulary stays private. */
export interface PaymentResult {
  state: PaymentResultState;
  reference?: string;
  amount?: Money;
  providerTransactionId?: string;
  providerFee?: Money;
  message?: string;
  providerData?: unknown;
  observation?: Omit<PaymentVerificationObservation, "checkedAt">;
}

export interface ProviderRequestContext {
  accountId: Id;
  fundingId: Id;
  reference: string;
  expectedAmount: Money;
  initialization?: PaymentInitializationMetadata;
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
  /** Latest customer-safe verification observation; persisted with the funding snapshot. */
  verification?: PaymentVerificationObservation;
}
export interface PaymentProvider {
  readonly name: string;
  readonly environmentOnly?: "development" | "test";
  readonly displayName: string;
  readonly imageUrl: string;
  readonly description: string;
  /** Short action shown before provider-specific payment details are created. */
  readonly customerActionLabel?: string;
  /** Currencies this provider collects in; this is distinct from canonical listing currency. */
  readonly collectionCurrencies?: readonly string[];
  /** Provider fallback when no customer-country preference is supported. */
  readonly defaultCollectionCurrency?: string;
  /** Optional selectable currencies used to settle a collection. */
  readonly paymentCurrencies?: readonly PaymentCurrencyOption[];
  readonly currencyMapping?: CurrencyMappingConfig;
  /** Provider-owned resolution of the fiat collection currency for funding. */
  readonly collectionCurrencyFor?: (input: {
    country: string | null;
    fundingOptionId?: string;
  }) => string;
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
    /** Internal provider-resolved fact; never a generic browser input. */
    collectionCurrency?: string;
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
    providerTransactionId?: string;
    initialization?: PaymentInitializationMetadata;
  }): Promise<PaymentResult>;
  /** Provider-specific customer interaction. The raw input is intentionally opaque to funding. */
  handleRequest?(input: unknown, context: ProviderRequestContext): Promise<PaymentResult>;
}

/** Small home for defaults shared by payment providers. */
export abstract class AbstractPaymentProvider implements PaymentProvider {
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly imageUrl: string;
  abstract readonly description: string;
  abstract initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
    country?: string | null;
    paymentCurrency?: string;
    fundingOptionId?: string;
  }): Promise<PaymentInitialization>;
  abstract verify(input: {
    reference: string;
    expectedAmount: Money;
    providerTransactionId?: string;
    initialization?: PaymentInitializationMetadata;
  }): Promise<PaymentResult>;

  async handleRequest(_input: unknown, _context: ProviderRequestContext): Promise<PaymentResult> {
    void _input;
    void _context;
    throw new Error(`Payment provider does not accept customer requests: ${this.name}`);
  }
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
