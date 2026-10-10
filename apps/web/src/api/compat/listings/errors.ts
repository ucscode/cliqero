import { DomainInvariantError, PublicApplicationError } from "@/kernel/errors";

export function listingRequestError(error: unknown) {
  return error instanceof DomainInvariantError
    ? new PublicApplicationError(error.message, "validation_error", 400)
    : error;
}
