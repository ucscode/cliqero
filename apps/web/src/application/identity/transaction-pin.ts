import { PublicApplicationError } from "@/kernel/errors";
import type { AuditRecorder } from "@/application/shared/audit";
import type {
  TransactionPinRepository,
  TransactionPinHasher,
} from "@/modules/identity/transaction-pin";
import type { IdentityPersistence } from "@/modules/identity/persistence";
import type { AuthenticationGateway } from "./contracts";

const pinPattern = /^\d{6}$/;

export class TransactionPinService {
  constructor(
    private readonly repository: TransactionPinRepository,
    private readonly hasher: TransactionPinHasher,
    private readonly identity: IdentityPersistence,
    private readonly gateway: Pick<
      AuthenticationGateway,
      "requestTransactionPinRecoveryCode" | "verifyTransactionPinRecoveryCode"
    >,
    private readonly audit: AuditRecorder,
  ) {}

  async status(accountId: string) {
    return { configured: await this.repository.exists(accountId) };
  }

  async set(accountId: string, pin: string) {
    this.assertPin(pin);
    await this.requireVerifiedEmail(accountId);
    const hash = await this.hasher.hashTransactionPin(pin);
    if (!(await this.repository.set(accountId, hash, true)))
      throw new PublicApplicationError(
        "A transaction PIN is already configured. Use Change PIN or recover it by email.",
        "transaction_pin_already_configured",
        409,
      );
    await this.record(accountId, "transaction_pin.set");
  }

  async change(accountId: string, currentPin: string, nextPin: string) {
    this.assertPin(nextPin);
    await this.requireVerifiedEmail(accountId);
    const hash = await this.hasher.hashTransactionPin(nextPin);
    const result = await this.repository.change(accountId, currentPin, hash, (value, currentHash) =>
      this.hasher.verifyTransactionPin(value, currentHash),
    );
    if (result === "valid") {
      await this.record(accountId, "transaction_pin.changed");
      return;
    }
    if (result === "missing")
      throw new PublicApplicationError(
        "Set a transaction PIN before changing it.",
        "transaction_pin_not_configured",
        409,
      );
    if (result === "locked") {
      await this.record(accountId, "transaction_pin.locked");
      throw new PublicApplicationError(
        "Transaction PIN attempts are temporarily locked. Try again later or recover your PIN by email.",
        "transaction_pin_locked",
        429,
      );
    }
    await this.record(accountId, "transaction_pin.failed");
    throw new PublicApplicationError(
      "The transaction PIN is incorrect.",
      "invalid_transaction_pin",
      403,
    );
  }

  async requestRecovery(accountId: string) {
    await this.requireVerifiedEmail(accountId);
    const email = await this.identity.accountEmail(accountId);
    if (!email) throw new PublicApplicationError("Account not found.", "not_found", 404);
    await this.gateway.requestTransactionPinRecoveryCode(email);
  }

  async recover(accountId: string, code: string, nextPin: string) {
    this.assertPin(nextPin);
    await this.requireVerifiedEmail(accountId);
    const email = await this.identity.accountEmail(accountId);
    if (!email) throw new PublicApplicationError("Account not found.", "not_found", 404);
    try {
      await this.gateway.verifyTransactionPinRecoveryCode(email, code);
    } catch {
      throw new PublicApplicationError(
        "The recovery code is invalid or expired.",
        "transaction_pin_recovery_invalid",
        400,
      );
    }
    await this.repository.set(accountId, await this.hasher.hashTransactionPin(nextPin));
    await this.record(accountId, "transaction_pin.recovered");
  }

  async requireValidPin(accountId: string, pin: string): Promise<void> {
    if (!pinPattern.test(pin))
      throw new PublicApplicationError(
        "Enter your six-digit transaction PIN.",
        "invalid_transaction_pin",
        400,
      );
    const result = await this.repository.verify(accountId, pin, (value, hash) =>
      this.hasher.verifyTransactionPin(value, hash),
    );
    if (result === "valid") return;
    if (result === "missing")
      throw new PublicApplicationError(
        "Set up a transaction PIN before moving money.",
        "transaction_pin_required",
        403,
      );
    if (result === "locked") await this.record(accountId, "transaction_pin.locked");
    if (result === "locked")
      throw new PublicApplicationError(
        "Transaction PIN attempts are temporarily locked. Try again later or recover your PIN by email.",
        "transaction_pin_locked",
        429,
      );
    if (result === "invalid") await this.record(accountId, "transaction_pin.failed");
    throw new PublicApplicationError(
      "The transaction PIN is incorrect.",
      "invalid_transaction_pin",
      403,
    );
  }

  private assertPin(pin: string) {
    if (!pinPattern.test(pin))
      throw new PublicApplicationError(
        "Transaction PIN must contain six digits.",
        "invalid_transaction_pin",
        400,
      );
  }

  private async requireVerifiedEmail(accountId: string) {
    if (!(await this.identity.accountEmailVerified(accountId)))
      throw new PublicApplicationError(
        "Verify your email address before managing your transaction PIN.",
        "email_verification_required",
        403,
      );
  }

  private async record(accountId: string, action: string) {
    await this.audit.record({
      actorId: accountId,
      action,
      subjectType: "account",
      subjectId: accountId,
      previousState: null,
      newState: { credential: "transaction_pin", secretRecorded: false },
    });
  }
}
