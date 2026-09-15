import { PublicApplicationError } from "@/kernel/errors";

export class InvalidDirectTrc20TransactionError extends PublicApplicationError {
  constructor(message = "Invalid TRON transaction hash.") {
    super(message, "invalid_transaction_hash", 422);
  }
}
