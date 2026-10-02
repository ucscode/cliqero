# Cliqero engineering rules

These rules are architectural requirements, not suggestions. They apply to all
future implementation, refactoring, code review, and agent handoffs.

If existing code conflicts with these rules, report the conflict and fix the
architecture deliberately. Do not silently copy a bad existing pattern merely
because it already exists.

## Non-negotiable invariants

These requirements are the durable project contract. They must survive chat,
model, agent, branch, and context handoffs.

Before substantial implementation or refactoring, an agent must confirm that
its plan satisfies all of the following:

1. **Preserve architectural roots and apply the grouping convention everywhere.**
   Group project functionality inside `api`, `app`, `application`, `components`,
   `infrastructure`, `modules`, `processors`, `providers`, `types`, `workers`,
   and other justified architectural roots. The functional grouping convention
   is repository-wide, not a special rule for `modules/`. When two or more
   sibling files share the same meaningful functional/ownership prefix, that
   prefix is a required directory boundary. For example, `auth-form.tsx` and
   `auth-shell.tsx` become `auth/form.tsx` and `auth/shell.tsx`; a `blog-*`
   family belongs under `blog/`; a `hierarchy-*` family belongs under
   `hierarchy/`. Do not leave related families flattened as filename prefixes
   such as `listing-media.ts`, `listing-reviews.ts`, `operator-distributions.ts`,
   or `payment-verification.ts`. Do not invert the hierarchy into
   `src/payment/...`, `src/listing/...`, etc.
2. **Libraries before redevelopment.** Before writing substantial custom code,
   investigate an official SDK or maintained library that already solves the
   problem. If no suitable external library exists and the implementation is
   substantial enough to become infrastructure in its own right, prefer a
   dedicated internal Cliqero library/workspace package over dumping that
   complexity into application or provider code. Reimplementation requires a
   concrete documented reason.
3. **OOP for business workflows and CRUD resources.** Prefer cohesive
   classes, interfaces, abstract bases, repositories, and services over
   scattered exported functions when behavior has one business owner. Ordinary
   CRUD resources must conform to the shared CRUD service/repository
   abstractions before adding resource-specific methods.
4. **Separate production and tests.** Production source directories must not
   become interleaved forests of `*.test.*` files.
5. **Reference data is data, not config.** Static lookup/reference datasets
   belong under the owning application's `data/reference` hierarchy, not
   runtime configuration and not the Next.js `src/app` route tree. For the web
   app, use `apps/web/data/reference/`.
6. **Shared code shares mechanism, not policy.** Provider/domain-specific
   decisions stay with their owner.
7. **Human navigability is mandatory.** The tree must communicate ownership to
   a human without requiring repository-wide AI search.
8. **Do not patch around structural mistakes.** Repeated fixes are a signal to
   inspect ownership, grouping, dependencies, and available libraries first.

If a proposed implementation violates any invariant above, stop and surface the
conflict before writing code.

## 1. Preserve architectural roots; group functionality inside them

Cliqero's top-level source directories represent architectural/technical
boundaries and should remain recognizable as such.

Examples include:

```text
src/
  api/
  app/
  application/
  components/
  infrastructure/
  modules/
  processors/
  providers/
  types/
  workers/
```

Do not replace these architectural roots with business-function roots such as:

```text
src/
  payment/
  withdrawal/
  listing/
  wallet/
```

That reverses the desired hierarchy and makes the project harder to navigate.

The rule is:

> Build project functionality inside the appropriate architectural root.
> Do not build architectural roots inside project functionality.

Correct:

```text
modules/
  listing/
    index.ts
    media/
    reviews/
  payment/
  withdrawal/

providers/
  payment/
    paystack/
    nowpayments/
    direct-trc20/
    bank-transfer/
  money/
  storage/
```

Wrong:

```text
payment/
  modules/
  providers/
  components/

listing/
  modules/
  providers/
```

The architectural root communicates what kind of code it is. The nested
functionality directory communicates what part of Cliqero it belongs to.

## 2. Functional grouping is mandatory across the repository

The same grouping convention applies inside every architectural root where
related application functionality exists. `modules/` is only one example.

This is not an optional cleanup preference. A repeated meaningful functional or
ownership prefix is evidence of a missing directory boundary.

### Mandatory repeated-prefix rule

When **two or more sibling code files** share the same meaningful prefix because
they belong to the same feature, owner, subsystem, or capability, create a
directory for that prefix and place the files inside it.

For example:

```text
components/
  auth-form.tsx
  auth-shell.tsx

  blog-card.tsx
  blog-editor.tsx
  blog-list.tsx

  hierarchy-node.tsx
  hierarchy-tree.tsx
```

must become:

```text
components/
  auth/
    form.tsx
    shell.tsx
  blog/
    card.tsx
    editor.tsx
    list.tsx
  hierarchy/
    node.tsx
    tree.tsx
```

Likewise:

```text
application/
  operator-accounts.ts
  operator-distributions.ts
  operator-funding.ts
```

must become:

```text
application/
  operator/
    accounts.ts
    distributions.ts
    funding.ts
```

And:

```text
processors/
  payment-initialization.ts
  payment-verification.ts
```

must become:

```text
processors/
  payment/
    initialization.ts
    verification.ts
```

Do not justify a repeated semantic prefix as "legitimately flat" merely because
each individual file is cohesive. If the prefix communicates shared ownership,
the directory must communicate that ownership instead.

A single isolated file does not require a directory solely because its filename
contains a hyphen. The rule activates when the same meaningful ownership prefix
appears on two or more siblings, or when one feature already warrants multiple
files.

The prefix must represent actual ownership/functionality, not incidental syntax
or a generic grammatical word. Framework- or tool-mandated filesystem names are
also exempt where changing them would break the framework. Any exception for a
repeated ownership prefix must be concrete and technical, not stylistic.

### Repository-wide examples

Prefer:

```text
modules/
  listing/
    index.ts
    media/
    reviews/

application/
  listing/
    service.ts
    media.ts
    reviews.ts
    transfer.ts
  operator/
    accounts.ts
    distributions.ts
    funding.ts
    treasury.ts

components/
  auth/
    form.tsx
    shell.tsx
  blog/
  hierarchy/
  listing/
  operator/
  payment/
    shared/
    paystack/
    nowpayments/
    direct-trc20/
    bank-transfer/

infrastructure/
  postgres/
    listing/
    payment/
    wallet/
    checkout/

processors/
  payment/
    initialization.ts
    verification.ts
  purchase/
    completion.ts
    distribution.ts

workers/
  payment/
    initialization/
  outbox/
  commercial/
```

instead of flattening related families such as:

```text
application/listing-media.ts
application/listing-reviews.ts
application/operator-distributions.ts
components/auth-form.tsx
components/auth-shell.tsx
components/blog-card.tsx
components/blog-editor.tsx
components/hierarchy-node.tsx
components/hierarchy-tree.tsx
components/payment-provider-components.tsx
infrastructure/postgres/listing-media.ts
processors/payment-verification.ts
workers/payment-initialization/
```

Likewise, do not flatten provider families:

```text
providers/
  paystack/
  nowpayments/
  fawaz/
  filesystem/
```

Use grouping that preserves both the architectural root and the functional
family:

```text
providers/
  payment/
    paystack/
    nowpayments/
  money/
    fawaz/
    frankfurter/
  storage/
    filesystem/
    supabase/
    cloudflare-r2/
```

Use directories to communicate ownership and relationships. Do not create long
filename prefixes as a substitute for structure.

This is a convention for the whole project. A refactor is not structurally
complete merely because one root such as `modules/` has been cleaned while
other roots still encode the same ownership through flattened filename
prefixes.

Framework-owned structures may keep framework-required conventions. For
example, Next.js `app/` routing follows Next.js filesystem semantics. Do not
force unrelated nesting where a framework defines the tree. Everywhere else,
prefer the smallest directory hierarchy that makes ownership obvious.

## 3. Libraries first; custom redevelopment requires justification

This rule is non-negotiable.

Before implementing a substantial integration, protocol, infrastructure layer,
UI system, parser, validator, client, SDK wrapper, state machine, or
framework-like abstraction manually, first investigate whether an official SDK
or maintained library already solves the requirement.

This applies especially to:

- payment SDKs and payment-management libraries;
- third-party API clients;
- authentication and authorization;
- HTTP routing;
- schema validation and serialization;
- cryptography and signature verification;
- database helpers;
- queues and workers;
- storage integrations;
- UI component systems;
- styling systems;
- forms and form validation;
- money/currency handling;
- country/currency/reference datasets;
- retry/backoff implementations;
- protocol implementations.

### Required workflow before custom implementation

For any meaningful new integration or infrastructure concern:

1. check for the provider/vendor's official SDK first;
2. check for a well-maintained ecosystem library if no suitable official SDK
   exists;
3. inspect maintenance/activity, TypeScript support, license, dependency weight,
   and whether the library actually removes meaningful custom code;
4. prefer wrapping the selected library behind Cliqero's own interface when the
   project needs a stable internal contract;
5. if no suitable external library exists, determine whether the implementation
   is substantial enough to deserve its own internal Cliqero library/workspace
   package instead of living directly in application/provider code;
6. write custom application-local infrastructure only when external and
   internal-library options are unsuitable, and record the concrete technical
   reason in the implementation report.

Do not rebuild an ecosystem library simply because the feature appears easy to
write or because an agent can generate the code quickly.

Agent generation speed is not a reason to own more code.

Less custom code is preferred when it produces a cleaner, safer, faster to
maintain, and more deterministic system.

Examples of the desired direction:

```text
Cliqero PaymentProvider
  -> official/maintained provider SDK
```

rather than:

```text
Cliqero PaymentProvider
  -> custom HTTP client
  -> custom DTO parser
  -> custom signature implementation
  -> custom retry implementation
```

when maintained libraries already provide those layers.

Existing custom code is not exempt. During refactoring, investigate whether a
library can delete or substantially simplify it rather than automatically
preserving it.

### Internal Cliqero libraries and workspace packages

"Libraries first" does not mean "third-party npm packages only".

When no suitable external library exists, substantial integration or protocol
complexity should be considered for extraction into a dedicated internal
Cliqero library/package instead of being accumulated inside application or
provider implementation directories.

Use this decision order:

```text
1. Suitable official or maintained external library
2. Dedicated internal Cliqero library/workspace package
3. Small application-local implementation
```

An internal library is appropriate when several of these are true:

- the concern requires multiple cohesive files/classes;
- it implements substantial third-party API or protocol mechanics;
- it has its own dependency surface;
- it benefits from isolated tests;
- it could reasonably be reused by another Cliqero app/service;
- keeping it inside a provider/application module would obscure business logic;
- it has a clean API independent of Cliqero business policy.

Do not create a package for a couple of simple helpers. Package extraction must
reduce complexity, not merely move it elsewhere.

Internal libraries should normally be workspace packages with explicit public
exports rather than application code reaching through arbitrary deep relative
imports. They do not need to be published to npm.

Conceptually, a complex Paystack client with no suitable external SDK could be:

```text
packages/
  payment/
    paystack/
      src/
        client.ts
        transactions.ts
        webhooks.ts
        errors.ts
        types.ts
      tests/
      package.json

apps/web/src/
  providers/
    payment/
      paystack/
        provider.ts
```

The dependency direction would be:

```text
Cliqero PaymentProvider contract
  -> PaystackProvider
      -> @cliqero/paystack
          -> Paystack REST API
```

The internal library may know Paystack's API/protocol. It must not know
Cliqero's funding state machine, wallet credits, canonical accounting,
entitlements, account ownership, or other application business policy.

The provider/application layer consumes the library and translates its protocol
results into Cliqero's own contracts.

This rule applies beyond payments as well. Storage, media, AI, external API, or
other integrations may become internal packages when their implementation is
large and cleanly reusable enough to justify that boundary.

## 4. OOP is a high-priority architectural requirement

Business logic should have an obvious owner.

Prefer cohesive classes and explicit object boundaries:

- interfaces;
- abstract classes;
- concrete implementations;
- services;
- repositories;
- domain objects;
- composition;
- inheritance where it improves the model.

Do not default to files containing many exported standalone functions for a
single business workflow.

Prefer:

```ts
class PaymentService {
  // cohesive payment behavior
}
```

instead of scattering one responsibility across unrelated exports such as:

```ts
export function createPayment() {}
export function verifyPayment() {}
export function updatePayment() {}
export function handlePaymentState() {}
```

Standalone functions are appropriate for genuinely stateless, reusable
utilities. They are not the default architecture for domain workflows.

When several implementations share a contract, prefer an interface and, when
shared implementation exists, an abstract base class or clear composition
boundary.
### CRUD services and repositories use shared abstract bases

Ordinary CRUD resources must conform to a common object-oriented contract. Use
shared abstract base classes for the service and persistence layers, conceptually
`CrudService` and `CrudRepository`, rather than allowing every resource to invent
its own CRUD vocabulary.

The canonical service vocabulary is:

```text
create
get
update
delete
```

The canonical repository vocabulary should represent the same persistence
lifecycle, using the project's chosen read naming consistently (for example
`find`/`findById`) while preserving create, update, and delete semantics.

Concrete services and repositories may add custom methods when the resource
genuinely needs behavior or queries beyond the base CRUD contract. Custom
methods extend the abstraction; they do not replace, bypass, rename, or distort
the ordinary CRUD operations.

Do not create action methods for changes that are fully represented by ordinary
resource fields. A status/state transition such as published, unpublished,
archived, restored, enabled, disabled, approved, or rejected is an update when
its meaning is simply the persisted state change.

Prefer:

```ts
resource.update(id, { status: "archived" });
```

over:

```ts
resource.archive(id);
```

Likewise, the canonical HTTP representation of an ordinary field/state change
is the resource update endpoint, normally `PATCH /resource/{id}`, not a
dedicated action endpoint such as `POST /resource/{id}/archive`.

A UI may expose concise convenience controls such as Publish, Archive, Restore,
Approve, or Reject. Those controls must submit through the same canonical update
path; they are presentation shortcuts, not separate domain commands.

Reserve additional command-style methods/endpoints for operations whose
semantics or side effects go beyond ordinary resource mutation, such as payment
completion, secret rotation, money movement, ledger generation, entitlement
creation, coordinated multi-resource workflows, or external-provider
interaction.

Do not force genuinely non-CRUD workflows into the CRUD base merely for
uniformity. The purpose of the abstraction is to make ordinary resources
predictable and make true domain commands obvious exceptions.

This shared service/repository contract is also the default API-alignment model:

```text
POST   /resources       -> create
GET    /resources/{id}  -> get
PATCH  /resources/{id}  -> update
DELETE /resources/{id}  -> delete
```

Resource-specific reads, queries, and genuine commands may extend this surface
where required.

## 5. Production and test code must be separated

Do not clutter production directories with colocated test files.

The test hierarchy should mirror the relevant production architecture where
practical.

Prefer:

```text
src/
  modules/
    listing/
      media/
  providers/
    payment/
      paystack/

tests/
  modules/
    listing/
      media/
  providers/
    payment/
      paystack/
```

Avoid:

```text
src/modules/listing/index.ts
src/modules/listing/index.test.ts
src/providers/payment/paystack/provider.ts
src/providers/payment/paystack/provider.test.ts
```

Tests belong under the project test hierarchy unless a tool or framework has a
hard technical requirement that makes separation impossible. Any exception
must be explicit and narrowly scoped.

## 6. Static/reference data is not configuration

Static datasets, country/currency mappings, reference tables, and similar JSON
data are application data, not runtime configuration.

For the web application, store reference datasets under the app-owned data root:

```text
apps/web/data/reference/country-currencies.json
```

More generally:

```text
apps/<app>/data/reference/*.json
```

Do not place these datasets under `apps/web/src/app/`: that directory belongs to
the Next.js application/router source tree, not static application reference
data.

Do not place reference datasets in `config/` merely because they are JSON.

Configuration controls application behavior. Reference data describes facts or
lookup data used by the application. Keep those concepts separate.

## 7. Shared code may share mechanism, not domain policy

A shared abstraction may provide reusable mechanics. It must not accumulate
provider-specific or domain-specific decisions.

Examples:

- a shared polling utility may implement polling, but Paystack, NOWPayments,
  and Direct TRC20 decide independently when they poll;
- a shared payment shell may render common layout, but it must not understand
  provider-specific forms or states;
- a shared repository helper may implement persistence mechanics, but it must
  not encode one provider's business semantics.

If shared code begins checking provider names or interpreting provider-specific
states, the ownership boundary is wrong.

## 8. Components must own their behavior

Frontend ownership follows the same grouping rule as the rest of the source
code: keep the architectural root, then group related functionality inside it.

For example:

```text
components/
  payment/
    paystack/
    nowpayments/
    direct-trc20/
    bank-transfer/
  listing/
  wallet/
```

Provider-specific payment UI belongs to that payment provider. Shared
components provide common layout and mechanisms only.

Do not build giant shared components containing growing provider-specific
branches, forms, timers, polling policies, or validation rules.

A simple provider-to-component resolver is acceptable. Provider business logic
inside the resolver or shared shell is not.

## 9. Human navigability is mandatory

The repository must be understandable by a human developer browsing the file
tree.

Do not optimize project structure around an AI agent's ability to search or
inspect thousands of files quickly.

Architectural roots should remain stable and recognizable. Functional grouping
inside those roots must make relationships obvious without repository-wide
semantic search.

## 10. Do not preserve bad architecture because work already exists

Sunk cost is not an architectural argument.

If an existing implementation violates the project architecture, refactor or
replace it rather than surrounding it with compatibility patches indefinitely.

Do not keep a structurally wrong design merely because significant work has
already been invested in it.

## 11. Avoid patch-first development

When repeated bugs or patches accumulate around the same feature, stop adding
local fixes and inspect the architecture first.

Review:

- ownership;
- grouping;
- abstractions;
- dependencies;
- duplicated logic;
- library alternatives;
- state boundaries;
- whether the existing design still matches these rules.

Fix the underlying structure before adding another patch.

## 12. Architectural context must survive handoffs

Agents must read this file before substantial implementation or refactoring.

A new chat, model, agent, or context handoff does not invalidate these rules.
The repository is the durable source of architectural requirements.

When a requested change would conflict with these rules, surface the conflict
instead of silently deviating from them.

At the start of a substantial task, the agent should explicitly verify the
non-negotiable invariants above instead of relying on remembered conversation
context.

## 13. Architecture before large refactors

Before moving or rewriting a large part of the project:

1. preserve and identify the existing architectural roots (`api`, `app`,
   `application`, `modules`, `providers`, `components`, `processors`, `types`,
   `infrastructure`, `workers`, etc.);
2. audit grouping inside every architectural root, not just `modules/`;
3. search each root for repeated meaningful filename prefixes; when two or more
   siblings share the same ownership prefix, make that prefix a directory unless
   a concrete framework/tool constraint forbids it;
4. identify other flat related families that should become internal directories;
5. identify violations of the OOP and dependency rules;
6. perform the library-first investigation for custom integrations and
   infrastructure, including whether a substantial custom integration belongs
   in a dedicated internal workspace package;
7. propose the target internal grouping consistently across the repository
   without inverting the root hierarchy;
8. move code in coherent functional groups, including matching tests, across
   the affected roots;
9. run validation after each coherent stage.

Do not perform a repository-wide move as an unreviewed mechanical shuffle.
Do not introduce `src/payment/...`, `src/listing/...`, or similar business-root
structures merely to claim domain grouping.

The desired direction is architecture-root first, functional grouping second,
consistently throughout the project.

## 14. Anti-drift implementation checklist

Before claiming a substantial feature or refactor complete, report:

- which architectural root owns the new code;
- how related functionality is grouped inside that root;
- whether any two or more sibling files still repeat the same meaningful
  functional/ownership prefix instead of using a directory, and if so the exact
  technical/framework reason;
- whether the same functional family is still flattened elsewhere in another
  architectural root;
- which official SDKs/libraries were investigated before custom code was
  written;
- whether a dedicated internal Cliqero library/package was considered when no
  suitable external library existed and the custom implementation was
  substantial;
- why any substantial custom implementation remained application-local instead
  of using an external or internal library boundary;
- which classes/interfaces own the business workflow;
- where the tests live;
- whether any provider/domain policy leaked into shared code;
- whether static data was incorrectly placed in configuration;
- whether the result remains understandable from the file tree alone.

A completion report that cannot answer these points should not claim the work is
architecturally complete.

# Operator CRUD invariants

Operator-managed mutable resources must provide Create, Read, Update, and
Delete operations wherever those operations are meaningful for the resource.
Archive, revoke, reject, disable, unpublish, and similar lifecycle actions are
status changes, not substitutes for Delete. Delete should physically remove a
mutable record when referential integrity permits it. If immutable historical
or financial facts must be retained, preserve those facts in explicit history
or audit storage rather than representing the mutable record as deleted.

Status/state is not special in Operator CRUD. When a mutable resource has a
status/state field, expose the supported states in its canonical Create/Edit
form, subject to the operator's authority. System-root operators can select all
legitimate domain states. Row controls such as Publish, Archive, Restore,
Approve, Reject, or Revoke may remain as UI conveniences only when they submit
through the canonical resource update operation. Do not create parallel
`publish()`, `archive()`, `restore()`, or similar service/repository methods
or action endpoints when the operation merely changes the persisted
status/state field.

Every mutable CRUD collection that supports row selection must provide a bulk
Delete action unless code documents a concrete immutable-history reason that
prevents it. Bulk mutations must use one browser request/server-side workflow
and report per-record outcomes; do not implement bulk actions as one browser
request per selected row.

Delete controls and root-delete semantics are separate requirements. Every
Operator table exposes row Delete and bulk Delete to `system.root`; root
deletion resolves dependencies and performs the resource's destructive
operation, so ordinary in-use or append-oriented restrictions do not block it.
Ordinary roles may retain safer soft-delete, tombstone, or rejection behavior.
An identity may remain as a deliberate tombstone only where required to retain
historical financial/account references, and that canonical model must be
explicitly documented rather than used as a generic deletion restriction.

Keep Operator action labels concise when the surrounding interface already
identifies the resource or selection: Edit, Delete, Publish, Archive, Restore,
Approve, and Reject. Avoid redundant labels such as "Edit listing", "Delete
review", "Approve selected", or "Delete selected" in that context.

# Contributor checks

## YAML configuration comments

Every new Cliqero-owned runtime configuration YAML file under `config/`, including
tracked `*.example.yaml` templates, must contain useful explanatory comments. A
new configuration file is not complete when it is only a bare schema/value
dump. Comment the file's purpose and, where relevant, non-obvious fields,
accepted values, null/disabled semantics, security-sensitive values, and
operational effects. Keep comments close to the settings they explain.

This requirement applies to Cliqero runtime configuration, not framework/tool
YAML such as GitHub Actions workflows or Docker Compose files.

When introducing a new directly-consumed Cliqero runtime environment variable,
document it in `docs/operations/environment-variables.md` in the same change.
Add it to `.env.example` only when it is required for normal bootstrap,
commonly configured, or important for immediate operator visibility. Variables
already surfaced through tracked module/provider configuration remain
documented with that configuration rather than being duplicated indiscriminately.

Use the repository formatter and quality checks before considering TypeScript or
Next.js changes complete:

```bash
npm run format
npm run lint
npm run typecheck
```

Use `npm run format:check` in CI or when verifying a clean formatting diff.
Prettier is authoritative for formatting; ESLint supplies code-quality rules and
must not reformat code independently. Keep generated, vendor, build, and local
credential/configuration files out of formatting and lint runs.

## Local worker development

The development `outbox-worker` uses a live repository source mount and keeps
its dependencies in Docker-owned anonymous volumes. Ordinary worker TypeScript
and YAML configuration changes do not require
`docker compose build outbox-worker`; the worker watch command restarts the
process for changes under `apps/web/src` and `config/`. Changes to `.env` or
Compose environment values require recreating the service, for example with
`just dev-restart`, but still do not require an image rebuild.

Rebuild only when package dependencies, the Dockerfile, the base image, or OS
packages change. Before claiming worker runtime verification passed, check:

```bash
docker compose ps
docker logs --tail=100 cliqero-outbox-worker-1
```

## Frontend implementation

Before implementing frontend UI, prefer the established component library and
Tailwind utilities. Do not create custom generic UI primitives or large custom
CSS systems when an existing project dependency solves the problem.

## Development database migrations

During active development, while destructive database reset is acceptable,
schema changes must be folded into `database/migrations/001_initial_schema.sql`.
Do not add numbered incremental migrations. Start preserving incremental
migration history only when the project reaches a stage where existing deployed
database state must be upgraded non-destructively.

## PostgreSQL integration tests

Use `just test-integration` for PostgreSQL integration validation. Unless an
explicit `TEST_DATABASE_URL` override is supplied, it prepares a disposable
`cliqero_test` database on the existing local Compose PostgreSQL service from
`database/migrations/001_initial_schema.sql`; it never targets the normal
`cliqero` development database. Do not skip integration tests just because
`TEST_DATABASE_URL` was not manually exported when local PostgreSQL tooling is
available. Report them skipped only when the PostgreSQL service or required
tooling cannot be used. `just test-db-reset` recreates only the disposable test
database without running the suite.

## Finance resource and ledger semantics

Treat mutable operational resources and historical financial facts differently:

- Mutable operational resources support normal Operator CRUD only where posted
  accounting and external evidence remain intact.
- `system.root` is the platform superuser. Every Operator-visible resource
  exposes Delete to `system.root`; ordinary roles may remain restricted.
  Root deletion is real deletion and uses resource-aware transactional cleanup
  so balances, foreign keys, and dependent data remain consistent. Append-only
  protections apply to ordinary domain operations, not to explicit root
  administrative deletion workflows, which must retain a safe audit snapshot
  where technically possible.
- The canonical account identity is a deliberate exception: Operator account
  deletion redacts and tombstones the identity row because historical records
  retain restrictive, non-null account references. This resource-specific
  tombstone preserves attribution; it is not a general root-delete restriction.
- A wallet transfer posts the source debit, destination credit/earnings
  adjustment, and any Treasury fee in one PostgreSQL transaction. Retries must
  be idempotent and all legs share a stable correlation identity.
- Cliqero's canonical internal accounting currency is USD. Provider collection
  currency conversion is provider-owned and does not make internal ledger
  currency configurable.
- The fee policy has one global `parameters.enabled` switch and one `enabled`
  switch per operation (`withdrawal`, `funding_to_earning`, and
  `earning_to_funding`). A fee is charged only when both switches are true.
  Disabled fees retain the configured percentage/cap but persist an explicit
  zero fee and gross-as-net snapshot; completion uses the historical withdrawal
  fee snapshot, and zero fees do not create Treasury entries.
- Administrative Funding is an internal source, never fabricated provider
  evidence. Its mutable record is separate from its accounting effect; amount,
  state, and deletion corrections append signed USD adjustments atomically.
  Delete physically removes the mutable record only after a compensating
  adjustment can be applied without making available funding negative.
- Withdrawal requests in mutable pre-payout states support Operator CRUD.
  Status edits must invoke the canonical withdrawal state machine. The fee and
  net amount are snapshotted while a request is mutable; Treasury receives the
  withdrawal fee at request time using the same correlation ID as the
  reservation and outbox operation. Rejected, cancelled, failed, edited, or
  deleted requests create the corresponding correlated reversal/delta; payout
  completion never credits the fee a second time.
- Every authoritative balance effect must have a visible/accountable history
  entry. Mutable administrative records are metadata, not substitutes for
  append-only financial movements.
- Money-creating financial POST operations require idempotency protection so
  retries cannot duplicate financial effects.
- Append-only accounting history must correlate to a stable operation identity
  and must not require a mutable administrative Funding or Withdrawal row to
  remain forever.
- Internal Operator HTTP calls use the session-only `/internal/*` surface.
  There is no `/api/operator/*` namespace; `/api/*` is the canonical external
  API surface.

Operator Create forms live on dedicated `/new` pages rather than above
collection tables. Financial multi-leg operations share a structured
correlation ID across their persisted legs, including wallet transfers,
earnings adjustments, Treasury entries, reservations, and outbox events.
