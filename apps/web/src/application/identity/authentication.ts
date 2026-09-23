import { newId } from "@/kernel/ids";
import { PublicApplicationError } from "@/kernel/errors";
import { Account } from "@/modules/identity/account";
import {
  DuplicateUsernameError,
  type IdentityPersistence,
  type AuthAccountLinkState,
} from "@/modules/identity/persistence";
import { assertPasswordMinimum } from "@/modules/identity/password-policy";
import { normalizeUsername } from "@/modules/identity/username";
import type { AuthenticationGateway } from "./contracts";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AccountReferralAttributionResolver } from "@/modules/referral/attribution";
import type { ReferralParentAssigner } from "@/modules/referral/referral";

function normalizeCountry(country: string | null | undefined): string | null {
  if (country === undefined || country === null) return null;
  const normalized = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw new Error("Country must be an ISO alpha-2 code");
  return normalized;
}

function authHeaders(token: string): Headers {
  return new Headers({ authorization: `Bearer ${token}` });
}

/** Better Auth authentication mapped to Cliqero's canonical Account identity. */
export class AuthenticationService {
  constructor(
    private readonly identity: IdentityPersistence,
    private readonly gateway: AuthenticationGateway,
    private readonly uow: UnitOfWork,
    private readonly accountReferral?: AccountReferralAttributionResolver,
    private readonly referralParentAssigner?: ReferralParentAssigner,
  ) {
    // Authentication remains an application workflow; the gateway and
    // persistence adapter are supplied by the composition root.
  }

  async register(input: {
    email: string;
    username: string;
    password: string;
    country?: string | null;
    accountReferralSource?: string;
  }): Promise<Account> {
    assertPasswordMinimum(input.password);
    const email = input.email.trim().toLowerCase();
    const username = normalizeUsername(input.username);
    const country = requireCountry(input.country);
    // A complete Cliqero identity always has a bridge row. An unlinked Better
    // Auth user is therefore an abandoned pre-provisioning artifact (for
    // example from an interrupted development attempt), never an OAuth user
    // awaiting username onboarding. Clearing only that invariant-violating
    // row keeps it from blocking a later legitimate registration.
    await this.identity.removeUnlinkedAuthUser(email);
    let result: { user: { id: string }; token?: string | null };
    try {
      result = await this.gateway.signUpEmail({ email, password: input.password });
    } catch {
      throw new PublicApplicationError(
        "We couldn’t create an account with those details.",
        "registration_failed",
      );
    }
    const account = new Account(newId(), username, country);
    try {
      await this.uow.transaction(async () => {
        await this.identity.createAccount(account);
        if (!(await this.identity.linkCompletedAuthAccount(result.user.id, account.id)))
          throw new Error("Authentication onboarding state is invalid");
        await this.assignAccountReferral(account, input.accountReferralSource);
      });
      return account;
    } catch (error) {
      await this.identity.removeAuthUser(result.user.id);
      if (error instanceof DuplicateUsernameError)
        throw new PublicApplicationError("That username is already taken.", "username_taken", 409, {
          username: "That username is already taken.",
        });
      if (error instanceof PublicApplicationError) throw error;
      throw new PublicApplicationError(
        "We couldn’t create an account with those details.",
        "registration_failed",
      );
    }
  }

  async login(email: string, password: string): Promise<{ account: Account; token: string }> {
    let result: { user: { id: string }; token?: string | null };
    try {
      result = await this.gateway.signInEmail({ email: email.trim().toLowerCase(), password });
    } catch (error) {
      throw error;
    }
    const account = await this.accountForAuthUser(result.user.id);
    if (!account) throw new Error("Account onboarding incomplete");
    if (!result.token) throw new Error("Authentication session unavailable");
    return { account, token: result.token };
  }

  async authenticate(token: string): Promise<Account | null> {
    if (!token || token.length > 500) return null;
    try {
      const session = await this.gateway.getSession(authHeaders(token));
      return session?.user ? this.accountForAuthUser(session.user.id) : null;
    } catch {
      return null;
    }
  }

  async authenticateRequest(request: Request): Promise<Account | null> {
    try {
      const session = await this.gateway.getSession(request.headers);
      return session?.user ? this.accountForAuthUser(session.user.id) : null;
    } catch {
      return null;
    }
  }

  async accountForAuthUser(authUserId: string): Promise<Account | null> {
    return this.identity.accountForAuthUser(authUserId);
  }

  async principal(request: Request): Promise<{
    authUserId: string;
    account: Account | null;
    authLinkState: AuthAccountLinkState;
  } | null> {
    try {
      const session = await this.gateway.getSession(request.headers);
      if (!session?.user) return null;
      return {
        authUserId: session.user.id,
        authLinkState: await this.identity.authAccountLinkState(session.user.id),
        account: await this.accountForAuthUser(session.user.id),
      };
    } catch {
      return null;
    }
  }

  async authUserEmail(authUserId: string): Promise<string | null> {
    return this.identity.authUserEmail(authUserId);
  }

  async resetPassword(authUserId: string, newPassword: string): Promise<void> {
    await this.gateway.resetPassword(authUserId, newPassword);
  }

  async hasPasswordCredential(authUserId: string): Promise<boolean> {
    return this.gateway.hasPasswordCredential(authUserId);
  }

  async completeOnboarding(
    authUserId: string,
    input: { username: string; country?: string | null; password?: string },
    headers?: Headers,
    accountReferralSource?: string,
  ): Promise<Account> {
    const country = requireCountry(input.country);
    const hasPassword = await this.gateway.hasPasswordCredential(authUserId);
    if (!hasPassword && !input.password)
      throw new PublicApplicationError(
        "Choose a password to finish setting up your account.",
        "validation_error",
        400,
        { password: "Choose a password to finish setting up your account." },
      );
    let createdCredentialId: string | null = null;
    if (!hasPassword && input.password) {
      assertPasswordMinimum(input.password);
      if (!headers)
        throw new Error("An authenticated request is required to create a local password");
      createdCredentialId = await this.gateway.setPassword(authUserId, input.password, headers);
    }
    const account = new Account(newId(), normalizeUsername(input.username), country);
    try {
      await this.uow.transaction(async () => {
        await this.identity.createAccount(account);
        if (!(await this.identity.linkCompletedAuthAccount(authUserId, account.id)))
          throw new Error("Authentication onboarding state is invalid");
        await this.assignAccountReferral(account, accountReferralSource);
      });
      return account;
    } catch (error) {
      if (createdCredentialId)
        await this.gateway.removePasswordCredential(authUserId, createdCredentialId);
      if (error instanceof DuplicateUsernameError)
        throw new PublicApplicationError("That username is already taken.", "username_taken", 409, {
          username: "That username is already taken.",
        });
      throw error;
    }
  }

  private async assignAccountReferral(account: Account, source: string | undefined): Promise<void> {
    if (!source || !this.accountReferral || !this.referralParentAssigner) return;
    const attribution = await this.accountReferral.claim(source, account.id);
    if (attribution)
      await this.referralParentAssigner.establish(account.id, attribution.referrerAccountId);
  }
}

function requireCountry(country: string | null | undefined): string {
  const normalized = normalizeCountry(country);
  if (!normalized)
    throw new PublicApplicationError("Choose a country to continue.", "validation_error", 400, {
      country: "Choose a country to continue.",
    });
  return normalized;
}

/** Kept for machine integration credentials; user sessions use Better Auth. */
export function bearerCredential(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}
