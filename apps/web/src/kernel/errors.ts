/** Stable across duplicated bundles; only explicitly classified invariants cross HTTP boundaries. */
export const DOMAIN_INVARIANT_ERROR = Symbol.for("cliqero.domain-invariant-error");

export class DomainInvariantError extends Error {
  readonly [DOMAIN_INVARIANT_ERROR] = true;
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "DomainInvariantError";
  }
}

/** Stable across duplicated bundles so only explicitly branded errors are public. */
export const PUBLIC_APPLICATION_ERROR = Symbol.for("cliqero.public-application-error");

/** A deliberate, stable error that may cross an application HTTP boundary. */
export class PublicApplicationError extends Error {
  readonly [PUBLIC_APPLICATION_ERROR] = true;
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "PublicApplicationError";
  }
}

/** The provider has already associated this external transaction with funding. */
export class DuplicateProviderTransactionError extends PublicApplicationError {
  constructor() {
    super("This provider transaction has already been used.", "provider_transaction_reused", 409);
  }
}
