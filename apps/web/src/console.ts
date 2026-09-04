import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PostgresDatabase } from "@/infrastructure/postgres/database";
import { AuthenticationService } from "@/modules/identity/authentication";

const capabilities = ["operator", "catalogue_manager", "blog_manager"] as const;
type Capability = (typeof capabilities)[number];
type AccountRow = { id: string; email: string; handle: string; country: string | null };
type IdentityContext = { database: PostgresDatabase; authentication: AuthenticationService };

function openContext(): IdentityContext {
  const database = PostgresDatabase.connect(requiredDatabaseUrl());
  return { database, authentication: new AuthenticationService(database, requiredDatabaseUrl()) };
}

async function closeContext(context: IdentityContext) {
  await context.authentication.betterAuth.close();
  await context.database.close();
}

function requiredDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

async function promptSecret(label: string): Promise<string> {
  if (!input.isTTY || !input.setRawMode) {
    const terminal = createInterface({ input, output });
    try {
      return (await terminal.question(`${label}: `)).trim();
    } finally {
      terminal.close();
    }
  }

  output.write(`${label}: `);
  input.setRawMode(true);
  input.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      input.setRawMode?.(false);
      input.pause();
      input.off("data", onData);
      output.write("\n");
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString()) {
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
        } else if (character === "\u0003") {
          cleanup();
          reject(new Error("Prompt cancelled"));
        } else if (character === "\u007f") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
        } else if (character >= " ") {
          value += character;
          output.write("*");
        }
      }
    };
    input.on("data", onData);
  });
}

async function promptNewPassword(label = "Password"): Promise<string> {
  const password = await promptSecret(label);
  if (!password) throw new Error("Password is required");
  const confirmation = await promptSecret("Confirm password");
  if (password !== confirmation) throw new Error("Passwords do not match");
  return password;
}

async function findAccount(
  context: IdentityContext,
  identifier: string,
): Promise<AccountRow & { authUserId: string }> {
  const row = (
    await context.database.query<AccountRow & { auth_user_id: string }>(
      `select a.id,a.email,a.handle,a.metadata->>'country' as country,l.auth_user_id
       from identity_capability.accounts a
       join identity_capability.auth_account_links l on l.account_id=a.id
       where a.id::text=$1 or lower(a.email)=lower($1) or lower(a.handle)=lower($1)
       limit 1`,
      [identifier.trim()],
    )
  ).rows[0];
  if (!row) throw new Error(`Account not found: ${identifier}`);
  return { ...row, authUserId: row.auth_user_id };
}

function printAccount(account: AccountRow & { capabilities?: string[] }) {
  console.log(
    JSON.stringify(
      {
        id: account.id,
        email: account.email,
        username: account.handle,
        country: account.country,
        capabilities: account.capabilities ?? [],
      },
      null,
      2,
    ),
  );
}

const program = new Command()
  .name("cliqero")
  .description("Cliqero application console")
  .showHelpAfterError();

program
  .command("user:create")
  .description("Create a normal application user")
  .requiredOption("--email <email>", "account email")
  .requiredOption("--username <username>", "account username")
  .option("--password <password>", "password (prompted when omitted)")
  .option("--country <iso>", "ISO alpha-2 country code")
  .action(
    async (options: { email: string; username: string; password?: string; country?: string }) => {
      const password = options.password ?? (await promptNewPassword());
      const context = openContext();
      try {
        const account = await context.authentication.register({
          email: options.email,
          handle: options.username,
          password,
          country: options.country,
        });
        console.log(`Created account ${account.email} (${account.handle})`);
      } finally {
        await closeContext(context);
      }
    },
  );

program
  .command("user:password")
  .description("Reset an account password through Better Auth")
  .argument("<identifier>", "email, username, or account ID")
  .option("--new-password <password>", "new password (prompted when omitted)")
  .action(async (identifier: string, options: { newPassword?: string }) => {
    const context = openContext();
    try {
      const account = await findAccount(context, identifier);
      const newPassword = options.newPassword ?? (await promptNewPassword("New password"));
      await context.authentication.resetPassword(account.authUserId, newPassword);
      console.log(`Password reset for ${account.email}`);
    } finally {
      await closeContext(context);
    }
  });

program
  .command("user:role")
  .description("Grant or revoke an existing account capability")
  .argument("<identifier>", "email, username, or account ID")
  .argument("<capability>", "operator, catalogue_manager, blog_manager, or normal")
  .option("--revoke", "revoke the capability")
  .action(async (identifier: string, capability: string, options: { revoke?: boolean }) => {
    const context = openContext();
    try {
      const account = await findAccount(context, identifier);
      const normalized = capability.toLowerCase();
      if (normalized === "normal") {
        if (!options.revoke)
          throw new Error(
            "The normal role is represented by no privileged capabilities; use --revoke",
          );
        const hasOperator =
          (
            await context.database.query(
              `select 1 from identity_capability.account_capabilities where account_id=$1 and capability='operator'`,
              [account.id],
            )
          ).rowCount === 1;
        if (hasOperator) {
          const count = (
            await context.database.query<{ count: string }>(
              `select count(*)::text as count from identity_capability.account_capabilities where capability='operator'`,
            )
          ).rows[0];
          if (Number(count?.count ?? 0) <= 1)
            throw new Error("Cannot revoke the last operator capability");
        }
        await context.database.query(
          `delete from identity_capability.account_capabilities where account_id=$1`,
          [account.id],
        );
        console.log(`Revoked privileged capabilities from ${account.email}`);
        return;
      }
      if (!(capabilities as readonly string[]).includes(normalized))
        throw new Error(`Unsupported capability. Choose: ${capabilities.join(", ")}, normal`);
      const value = normalized as Capability;
      if (options.revoke) {
        if (value === "operator") {
          const count = (
            await context.database.query<{ count: string }>(
              `select count(*)::text as count from identity_capability.account_capabilities where capability='operator'`,
            )
          ).rows[0];
          if (Number(count?.count ?? 0) <= 1)
            throw new Error("Cannot revoke the last operator capability");
        }
        await context.database.query(
          `delete from identity_capability.account_capabilities where account_id=$1 and capability=$2`,
          [account.id, value],
        );
        console.log(`Revoked ${value} from ${account.email}`);
      } else {
        await context.database.query(
          `insert into identity_capability.account_capabilities(account_id,capability) values($1,$2) on conflict do nothing`,
          [account.id, value],
        );
        console.log(`Granted ${value} to ${account.email}`);
      }
    } finally {
      await closeContext(context);
    }
  });

program
  .command("user:list")
  .description("List application accounts and capabilities")
  .option("--limit <number>", "maximum rows", "50")
  .action(async (options: { limit: string }) => {
    const context = openContext();
    try {
      const limit = Math.min(200, Math.max(1, Number.parseInt(options.limit, 10) || 50));
      const rows = (
        await context.database.query<AccountRow & { capabilities: string[] }>(
          `select a.id,a.email,a.handle,a.metadata->>'country' as country,
             coalesce(array_agg(ac.capability) filter(where ac.capability is not null),'{}') capabilities
           from identity_capability.accounts a
           left join identity_capability.account_capabilities ac on ac.account_id=a.id
           group by a.id order by a.created_at desc,a.id desc limit $1`,
          [limit],
        )
      ).rows;
      rows.forEach((row) => printAccount(row));
    } finally {
      await closeContext(context);
    }
  });

program
  .command("user:show")
  .description("Show one application account")
  .argument("<identifier>", "email, username, or account ID")
  .action(async (identifier: string) => {
    const context = openContext();
    try {
      const account = await findAccount(context, identifier);
      const roles = (
        await context.database.query<{ capability: string }>(
          `select capability from identity_capability.account_capabilities where account_id=$1 order by capability`,
          [account.id],
        )
      ).rows.map((row) => row.capability);
      printAccount({ ...account, capabilities: roles });
    } finally {
      await closeContext(context);
    }
  });

await program.parseAsync(process.argv);
