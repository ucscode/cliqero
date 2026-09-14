export class DomainInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainInvariantError";
  }
}

/** A deliberate, stable error that may cross an application HTTP boundary. */
export class PublicApplicationError extends Error {
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
