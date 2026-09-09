import { Pool } from "pg";
import { betterAuth, type Auth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import { nextCookies } from "better-auth/next-js";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import { sendAuthEmail, type AuthEmail } from "@/lib/email";
import { siteConfig } from "@/config/site";
import { getEnabledSocialProviders } from "@/config/auth";
import { PASSWORD_MIN_LENGTH } from "./password-policy";

const developmentSecret = "cliqero-development-better-auth-secret-change-me-32";

function requiredSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production")
    throw new Error("BETTER_AUTH_SECRET is required in production");
  return developmentSecret;
}

async function deliverAuthenticationEmail(
  kind: "verification" | "reset",
  message: { user: { email: string; name?: string | null }; url: string; token: string },
): Promise<void> {
  await sendAuthEmail(kind, message);
}

// The concrete option object is intentionally assembled from environment
// values, so retain the public Auth surface without leaking its inferred
// option literal through every application service.
export type BetterAuthInstance = Auth<any>;

export class BetterAuthBoundary {
  readonly auth: BetterAuthInstance;
  private readonly pool: Pool;

  constructor(
    private readonly sql: SqlExecutor,
    databaseUrl: string,
  ) {
    // Keep Better Auth's tables separate from Cliqero's domain schemas. The
    // explicit search_path also prevents accidental unqualified reads from
    // business tables with similarly named columns.
    this.pool = new Pool({
      connectionString: databaseUrl,
      options: "-c search_path=better_auth",
      allowExitOnIdle: true,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    // Better Auth owns a separate pool; prevent an idle connection error from
    // becoming an uncaught process-level event during a database restart.
    this.pool.on("error", () => undefined);
    this.auth = betterAuth({
      appName: siteConfig.name,
      baseURL: siteConfig.url,
      basePath: "/api/auth",
      secret: requiredSecret(),
      database: this.pool,
      // Better Auth keeps its public/protocol field named `name`, but its
      // physical column is explicitly a provider/display name. Cliqero's
      // username lives only on identity_capability.accounts.
      user: {
        fields: {
          name: "display_name",
        },
      },
      emailAndPassword: {
        enabled: true,
        autoSignIn: false,
        minPasswordLength: PASSWORD_MIN_LENGTH,
        requireEmailVerification: false,
        sendResetPassword: (message: AuthEmail) => deliverAuthenticationEmail("reset", message),
      },
      emailVerification: {
        sendVerificationEmail: (message: AuthEmail) =>
          deliverAuthenticationEmail("verification", message),
        sendOnSignUp: true,
      },
      account: {
        accountLinking: {
          enabled: true,
          trustedProviders: Object.keys(getEnabledSocialProviders()),
          // A local password account must prove ownership of its email before
          // an OAuth identity can be implicitly linked to it.
          requireLocalEmailVerified: true,
          allowDifferentEmails: false,
        },
      },
      socialProviders: getEnabledSocialProviders(),
      plugins: [bearer(), nextCookies()],
      databaseHooks: {
        user: {
          create: {
            after: async (user: { id: string }) => {
              await this.sql.query(
                `insert into identity_capability.auth_account_links (auth_user_id)
                 values ($1) on conflict (auth_user_id) do nothing`,
                [user.id],
              );
            },
          },
        },
      },
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Reset a credential from a trusted server-side operation.
   *
   * Better Auth's public changePassword endpoint is intentionally a
   * self-service operation and requires the current password. The canonical
   * reset flow in Better Auth hashes through its configured password utility
   * and persists through the internal adapter, so the console uses the same
   * supported primitives without duplicating hashing or credential storage.
   */
  async resetPassword(authUserId: string, newPassword: string): Promise<void> {
    const context = await this.auth.$context;
    const minLength = context.password.config.minPasswordLength;
    const maxLength = context.password.config.maxPasswordLength;
    if (newPassword.length < minLength)
      throw new Error(`Password must contain at least ${minLength} characters`);
    if (newPassword.length > maxLength)
      throw new Error(`Password must contain no more than ${maxLength} characters`);

    const user = await context.internalAdapter.findUserById(authUserId);
    if (!user) throw new Error("Authentication user not found");
    const password = await context.password.hash(newPassword);
    const credential = await context.internalAdapter.findCredentialAccount(authUserId);
    if (credential) {
      await context.internalAdapter.updatePassword(authUserId, password);
    } else {
      const { createLocalAccountIssuer } = await import("@better-auth/core/db");
      await context.internalAdapter.createAccount({
        userId: authUserId,
        providerId: "credential",
        issuer: createLocalAccountIssuer("credential"),
        accountId: user.id,
        password,
      });
    }
    if (context.options.emailAndPassword?.revokeSessionsOnPasswordReset)
      await context.internalAdapter.deleteUserSessions(authUserId);
  }

  async hasPasswordCredential(authUserId: string): Promise<boolean> {
    const context = await this.auth.$context;
    return Boolean((await context.internalAdapter.findCredentialAccount(authUserId))?.password);
  }

  /**
   * Add a local credential to an authenticated OAuth account. Better Auth's
   * server-only setPassword endpoint owns password hashing and account-row
   * persistence; this method keeps that protocol boundary in one place.
   */
  async setPassword(authUserId: string, newPassword: string, headers: Headers): Promise<string> {
    await this.auth.api.setPassword({ body: { newPassword }, headers });
    const context = await this.auth.$context;
    const credential = await context.internalAdapter.findCredentialAccount(authUserId);
    if (!credential) throw new Error("Better Auth did not create a credential account");
    return credential.id;
  }

  async removePasswordCredential(authUserId: string, credentialId: string): Promise<void> {
    const context = await this.auth.$context;
    const credential = await context.internalAdapter.findCredentialAccount(authUserId);
    if (credential?.id === credentialId) await context.internalAdapter.deleteAccount(credential.id);
  }
}
