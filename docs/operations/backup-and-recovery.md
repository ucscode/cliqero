# Backup and recovery

Cliqero has three application data stores that must be recovered together:

| Store            | Authoritative data                                                                     | Local Compose persistence | Backup mechanism                                                            |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| PostgreSQL       | Application domains, financial/accounting history, Better Auth identities and sessions | `postgres-data`           | PostgreSQL 17 `pg_dump` custom archive; inspected with `pg_restore --list`  |
| Blog SQLite      | Posts, revisions, previews, categories, tags, and idempotency records                  | `blog-data`               | SQLite online backup API (`better-sqlite3`), then integrity check           |
| Filesystem media | Uploaded catalogue images and submitted evidence stored by the filesystem provider     | `media-data`              | GNU tar archive retaining paths, modes, numeric ownership, ACLs, and xattrs |

The Blog database uses WAL mode. Never copy its live `.sqlite` file as a backup:
the WAL can contain committed records not yet checkpointed. The backup helper
uses SQLite's online backup operation. PostgreSQL's dump is transactionally
consistent for that database. Cliqero has no transaction spanning PostgreSQL,
Blog SQLite, and files, so the backup recipe stops the web app and outbox worker
before taking all three snapshots. Before starting it, stop any other process or
integration that writes to those stores; pass the explicit no-other-writers
confirmation. The recipe restarts only services that were running when it
started, including after a failure.

## What is not in a data bundle

Build output (`.next`), node modules, caches, logs, and development/test
fixtures are regenerable and are not backed up. Compose configuration, the
canonical schema source, application code, and tracked `*.example.yaml` files
are source-controlled at the manifest's `sourceCommit` and
`schemaBaselineSha256`. Ignored runtime YAML, `.env`, external provider
credentials, `BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY`, and PostgreSQL role
passwords are deliberately not copied into the data bundle or its manifest.
They are deployment configuration dependencies: preserve them in an approved,
access-controlled secret/configuration manager and restore them separately.
If an encryption key is lost, encrypted application/API-key material may not be
recoverable even when its database is intact. Do not rotate or regenerate a key
as part of restoration.

The media recipe includes filesystem objects used by persisted media identities.
It refuses to report a complete bundle if an existing media/evidence record
uses an external storage provider. Supabase and Cloudflare R2 objects need
provider-native versioning/replication or a separately tested export-and-restore
procedure; the local `media-data` volume is not a copy of those objects. No
external destination is configured by this repository.

## Create and verify a backup

Install/start the appropriate Compose stack and ensure PostgreSQL is healthy.
Choose a backup directory on a different host/filesystem from the Compose data
volumes, with restricted access. The default is `../cliqero-backups`, outside
this checkout. The directory is created with mode `0700`; bundle files are
`0600`. Do not place it in the repository or under Docker's volume storage.

```bash
just backup confirm='NO OTHER WRITERS'
# Or choose an external destination:
just backup output=/secure/off-host/cliqero confirm='NO OTHER WRITERS'

just backup-verify /secure/off-host/cliqero/cliqero-<UTC timestamp>
```

The recipe creates a private staging directory and publishes a timestamped
bundle only after all components are non-empty and checked. A completed bundle
contains:

```text
manifest.json       format/version, app version, source commit, schema hash,
                    snapshot mode, volume identities, component sizes/hashes
postgres.dump       PostgreSQL custom-format database dump
blog.sqlite         standalone consistent SQLite snapshot
media.tar.gz        filesystem media archive
```

There is no success manifest in a partial bundle. Failed staging data is
removed, and the command exits unsuccessfully. Verification checks each
component's size/SHA-256, SQLite `integrity_check`, tar readability, and the
PostgreSQL archive directory. It does not prove a restore is usable; perform the
rehearsal below periodically.

`just backup-prod` uses only the production base Compose configuration and
requires both an explicit production confirmation and the no-other-writers
confirmation. This command was not run as part of this checkpoint. Do not use
the development backup as a production backup policy without reviewing the
external storage, secret management, destination access, and retention controls.

## Restore into a new destination

Restoration is deliberately not an in-place overwrite command. Keep the source
bundle immutable. Select an isolated PostgreSQL server/cluster and new empty
database name, and new Blog/media destinations. Do not select an existing
database or volume. For production recovery, use an approved maintenance window
and restore into a new database/volume set first; switch application
connections only after validation and an independently reviewed cutover. Never
run development reset recipes as production recovery.

1. Verify the bundle and confirm its source commit/schema hash against the
   intended release:

   ```bash
   just backup-verify /secure/off-host/cliqero/cliqero-<UTC timestamp>
   ```

2. Restore the PostgreSQL archive to a **new, non-existing** database. Use the
   cluster's bootstrap/schema-owner connection only for this controlled
   provisioning; keep its password in the normal secret mechanism, not shell
   history. Substitute the selected database name in the commands, and check
   for existence before creating it:

   ```bash
   RESTORE_DB=cliqero_restore_YYYYMMDD_HHMM
   docker compose exec -T postgres sh -ec \
     'if psql -U "$POSTGRES_USER" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '\''$1'\''" | grep -qx 1; then echo "refusing existing database" >&2; exit 1; fi; createdb -U "$POSTGRES_USER" "$1"' \
     sh "$RESTORE_DB"
   docker compose run --rm --no-deps -T \
     -v "$(realpath /secure/off-host/cliqero/cliqero-<UTC timestamp>)/:/restore:ro" \
     --entrypoint sh postgres -ec \
     'pg_restore --exit-on-error --no-owner --no-acl -h postgres -U "$POSTGRES_USER" -d "$1" /restore/postgres.dump && psql -h postgres -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -f /opt/cliqero/roles/provision-runtime-role.sql && psql -h postgres -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -f /opt/cliqero/roles/harden-runtime-triggers.sql' \
     sh "$RESTORE_DB"
   ```

   Use the Compose project/connection corresponding to the explicitly selected
   recovery cluster, not necessarily the development project shown above. For
   a production project, use `docker compose -p cliqero-prod -f compose.yaml`
   for every command; never load the development override. Do not continue if
   the database existed before this restore. A failed `pg_restore` leaves the
   newly created database incomplete: keep it disconnected, record the failure,
   and have an operator verify its exact name before removing it and retrying.

3. Restore Blog and media into new, empty destinations. Verify the target paths
   do not already exist before creating them. Extract media with GNU tar so
   stored metadata is retained, and copy the closed SQLite snapshot (not a live
   source database):

   ```bash
   mkdir -m 0700 /recovery/cliqero-<id>
   mkdir -m 0750 /recovery/cliqero-<id>/blog /recovery/cliqero-<id>/media
   cp --no-clobber /secure/off-host/cliqero/cliqero-<UTC timestamp>/blog.sqlite \
     /recovery/cliqero-<id>/blog/blog.sqlite
   tar --extract --gzip --file=/secure/off-host/cliqero/cliqero-<UTC timestamp>/media.tar.gz \
     --directory=/recovery/cliqero-<id>/media --same-permissions --same-owner --numeric-owner --acls --xattrs
   ```

4. Reconnect the recovered application to the new PostgreSQL database, Blog
   path, and media root through the deployment's secured configuration system.
   Restore the matching application release and required Better Auth,
   application-encryption, runtime database, and provider secrets from that
   system. Never put secret values in the manifest, command line, or report.
   Do not start the recovered app until all three restored stores and
   configuration are selected as one recovery set.

5. Validate PostgreSQL object/foreign-key integrity, required schemas,
   append-only triggers and runtime-role privileges; run SQLite integrity
   checks; compare media file counts and hashes with the backup; then start the
   app and worker in an isolated recovery project. Check Better Auth account
   linkage, representative read-only API routes, Blog content, and media asset
   reads. A database-only restore is not a completed Cliqero recovery.

## Rehearsal and operations

This repository does not create a scheduler, off-host bucket, or encryption
system. Recommended operational controls (not guarantees):

- Schedule database and application-store backups at a cadence chosen from the
  business's accepted data-loss window; monitor exit status, artifact age,
  component hashes, and destination capacity.
- Keep multiple known-good generations with documented retention; delete only
  by an approved retention job after verifying newer complete bundles.
- Copy bundles off-host promptly. Restrict write/read/delete access separately;
  protect financial and authentication data as sensitive records.
- Encrypt at rest and in transit using the approved storage/platform facility
  or a maintained tool such as age/restic. Store encryption recovery material
  separately and test its retrieval. This implementation does not add custom
  cryptography or encrypt bundles itself.
- Rehearse restoration to disposable infrastructure on a schedule. Record
  actual backup and restore durations, store counts, and validation outcomes.
  RPO and RTO are operational targets to set and measure; this checkpoint makes
  no RPO/RTO guarantee.
- Restore in dependency order: matching code/config and keys available;
  PostgreSQL and restricted runtime role; Blog SQLite; media/provider objects;
  app/worker; read-only/authentication/asset checks. Keep writes disabled until
  the recovered set is validated.

An interrupted backup cannot appear complete because the manifest is written
last. An interrupted restore never overwrites its source bundle or an existing
database by design. Treat its new database and destination directory as
incomplete, keep them disconnected, verify the exact targets, and restart into
fresh destinations. Do not automate cleanup of a partially restored financial
database without first confirming that it is the one created for that attempt.
