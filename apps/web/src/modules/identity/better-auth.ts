import { Pool } from "pg";
import { betterAuth, type Auth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import { nextCookies } from "better-auth/next-js";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import { sendAuthEmail, type AuthEmail } from "@/lib/email";
import { siteConfig } from "@/config/site";

const developmentSecret = "cliqero-development-better-auth-secret-change-me-32";

function requiredSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production")
    throw new Error("BETTER_AUTH_SECRET is required in production");
  return developmentSecret;
}

function socialProviders() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!!clientId !== !!clientSecret)
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together");
  if (!clientId || !clientSecret) return undefined;
  return { google: { clientId, clientSecret } };
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
    this.auth = betterAuth({
      appName: siteConfig.name,
      baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000",
      basePath: "/api/auth",
      secret: requiredSecret(),
      database: this.pool,
      emailAndPassword: {
        enabled: true,
        autoSignIn: false,
        minPasswordLength: 12,
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
          trustedProviders: ["google"],
          // A local password account must prove ownership of its email before
          // an OAuth identity can be implicitly linked to it.
          requireLocalEmailVerified: true,
          allowDifferentEmails: false,
        },
      },
      socialProviders: socialProviders(),
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
}
