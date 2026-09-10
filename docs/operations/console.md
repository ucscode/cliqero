# Cliqero application console

The application console is Cliqero's canonical terminal entry point for
trusted developer and operator identity tasks. It runs in the development
application container, so commands use the same installed dependencies,
configuration, and PostgreSQL connection as the running web application.

The console is deliberately one discoverable command rather than a collection
of unrelated administrative scripts. Future operational commands can be added
to the same command tree.

## Invocation and environment

Start the development stack first, then use:

```bash
just cli --help
```

`just cli` executes `npm run cli --workspace @cliqero/web` through
`docker compose exec main`. Compose supplies `DATABASE_URL` for the `main`
service, pointing at the development PostgreSQL container. This is the
canonical invocation; direct npm execution is still available for low-level
work when a caller supplies a suitable `DATABASE_URL` itself.

Command-specific help is available with the same interface:

```bash
just cli user:create --help
just cli user:password --help
just cli user:capability --help
just cli user:list --help
just cli user:show --help
```

Passwords are never printed. When a password option is omitted, the console
prompts interactively without echoing the value and asks for confirmation.
An explicit password option is supported for automation, but command-line
passwords can be retained in shell history and process listings; an interactive
prompt is safer.

User identifiers accepted by account-oriented commands are:

- email address (case-insensitive)
- username (the canonical account field is `username`)
- canonical Cliqero account ID

## `user:create`

Create a normal application user with a Better Auth credential and a linked
Cliqero account.

```bash
just cli user:create \
  --email user@example.com \
  --username example \
  --country NG
```

Options:

- `--email <email>` — required account email.
- `--username <username>` — required user-facing username.
- `--country <iso>` — optional ISO alpha-2 country code, such as `NG`.
- `--password <password>` — optional explicit password; omit it for the
  hidden interactive password and confirmation prompts.

The command creates the Better Auth credential identity, links it to the
canonical Cliqero account, and leaves the account as a normal user with no
privileged capability. It does not grant any other direct capability.

For an interactive, history-safe password setup:

```bash
just cli user:create --email user@example.com --username example --country NG
# Password and Confirm password prompts follow
```

## `user:password`

Reset an account password through the server-side Better Auth integration.
This is a trusted administrative reset, not a self-service change: the old
password is not required and no browser session is needed.

```bash
just cli user:password user@example.com
```

The argument may be an email, username, or Cliqero account ID. The console
prompts for a hidden `New password` and `Confirm password` pair when
`--new-password` is omitted. `--new-password <password>` is available for
non-interactive use, with the same shell-history warning as `user:create`.

Better Auth remains authoritative for password hashing and credential
storage; the console does not implement a second hash algorithm or credential
store.

## `user:capability`

Grant or revoke an existing account capability:

```bash
just cli user:capability user@example.com catalogue.manage
just cli user:capability user@example.com content.manage
just cli user:capability user@example.com content.manage --revoke
```

The currently supported privileged capabilities are the identifiers in the
application capability registry, including `catalogue.manage`, `content.manage`,
`accounts.read`, `hierarchy.manage`, `finance.read`, `finance.manage`,
`withdrawals.manage`, `treasury.manage`, `reviews.moderate`, `api_keys.manage`,
`capabilities.manage`, and `system.root` (master operator authority). API-key
scopes still restrict keys owned by a root account.

`admin`, `superadmin`, and legacy role names are not capabilities in the current
authorization model. To remove one capability, pass it with `--revoke`.

Capabilities are evaluated directly: `system.root` is the only master
capability, and no capability implicitly grants another (for example,
`finance.manage` does not include `finance.read`). Grant both explicitly when
an operator needs both financial mutation and reporting access.

To bootstrap the first operator:

```bash
just cli user:create --email admin@example.com --username admin
just cli user:capability admin@example.com system.root
```

The console protects the installation's last root: it refuses to revoke the
final remaining `system.root` capability.

## `user:list`

List application accounts, newest first, as one JSON object per line. Each
object includes the canonical account ID, email, username, country, and the
currently assigned capabilities.

```bash
just cli user:list
just cli user:list --limit 100
```

`--limit` defaults to 50 and is bounded to a maximum of 200. This command is
intended for operator inspection and scripting; it does not print passwords or
other credential material.

## `user:show`

Show one account as formatted JSON, including its canonical ID, email,
username, country, and sorted capabilities.

```bash
just cli user:show admin@example.com
just cli user:show admin
just cli user:show 00000000-0000-0000-0000-000000000000
```

The identifier can be an email, username, or Cliqero account ID. The command
fails clearly when no matching account exists.

## Help for future commands

Every command is discoverable through Commander help. Use:

```bash
just cli <command> --help
```

Only commands shown by `just cli --help` and implemented in the console should
be treated as supported; this document intentionally does not list future
commands that do not yet exist.
