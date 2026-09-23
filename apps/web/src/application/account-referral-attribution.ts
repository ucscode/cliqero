import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AccountReader } from "@/modules/identity/account";
import type {
  AccountReferralAttribution,
  AccountReferralAttributionRepository,
  AccountReferralAttributionResolver,
} from "@/modules/referral/attribution";
import { referralAccountUrl } from "@/modules/referral/url";

const uuidSchema = z.uuid();
const lifetimeSeconds = 30 * 24 * 60 * 60;

function hash(source: string): Buffer {
  return createHash("sha256").update(source, "utf8").digest();
}

function validAccountId(accountId: string): boolean {
  return uuidSchema.safeParse(accountId).success;
}

function validSource(source: string | undefined): source is string {
  return Boolean(source && source.length <= 200);
}

export class AccountReferralAttributionService implements AccountReferralAttributionResolver {
  constructor(
    private readonly attributions: AccountReferralAttributionRepository,
    private readonly accounts: AccountReader,
    private readonly uow: UnitOfWork,
  ) {}

  async urlFor(referrerAccountId: string): Promise<string> {
    if (!validAccountId(referrerAccountId) || !(await this.accounts.exists(referrerAccountId)))
      throw new Error("Referral account not found");
    return referralAccountUrl(referrerAccountId);
  }

  async visit(
    referrerAccountId: string,
    previousSource?: string,
  ): Promise<{ source: string } | null> {
    if (!validAccountId(referrerAccountId) || !(await this.accounts.exists(referrerAccountId)))
      return null;
    const source = randomBytes(32).toString("base64url");
    await this.uow.transaction(async () => {
      if (validSource(previousSource))
        await this.attributions.revokeAccountAttribution(hash(previousSource));
      await this.attributions.createAccountAttribution({
        id: newId(),
        referrerAccountId,
        tokenHash: hash(source),
        expiresAt: new Date(Date.now() + lifetimeSeconds * 1000),
      });
    });
    return { source };
  }

  async resolve(source: string | undefined): Promise<AccountReferralAttribution | null> {
    if (!validSource(source)) return null;
    return this.attributions.resolveAccountAttribution(hash(source));
  }

  async claim(
    source: string | undefined,
    childAccountId: string,
  ): Promise<AccountReferralAttribution | null> {
    if (!validSource(source) || !validAccountId(childAccountId)) return null;
    return this.attributions.claimAccountAttribution(hash(source), childAccountId);
  }
}
