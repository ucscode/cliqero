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
   is repository-wide, not a special rule for `modules/`. Do not leave related
   families flattened as filename prefixes such as `listing-media.ts`,
   `listing-reviews.ts`, `operator-distributions.ts`, or `payment-verification.ts`
   when a clear owning directory can express that relationship. Do not invert
   the hierarchy into `src/payment/...`, `src/listing/...`, etc.
2. **Libraries before redevelopment.** Before writing substantial custom code,
   investigate an official SDK or maintained library that already solves the
   problem. If no suitable external library exists and the implementation is
   substantial enough to become infrastructure in its own right, prefer a
   dedicated internal Cliqero library/workspace package over dumping that
   complexity into application or provider code. Reimplementation requires a
   concrete documented reason.
3. **OOP for business workflows.** Prefer cohesive classes, interfaces,
   abstract bases, repositories, and services over scattered exported
   functions when behavior has one business owner.
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

## 2. Functional grouping is a repository-wide convention

The same grouping convention applies inside every architectural root where
related application functionality exists. `modules/` is only one example.

Related functionality must be grouped under a clear owning directory rather
than encoded repeatedly in filenames.

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
  payout/
    paystack/
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
3. identify flat related families in each root that should become internal
   directories;
4. identify violations of the OOP and dependency rules;
5. perform the library-first investigation for custom integrations and
   infrastructure, including whether a substantial custom integration belongs
   in a dedicated internal workspace package;
6. propose the target internal grouping consistently across the repository
   without inverting the root hierarchy;
7. move code in coherent functional groups, including matching tests, across
   the affected roots;
8. run validation after each coherent stage.

Do not perform a repository-wide move as an unreviewed mechanical shuffle.
Do not introduce `src/payment/...`, `src/listing/...`, or similar business-root
structures merely to claim domain grouping.

The desired direction is architecture-root first, functional grouping second,
consistently throughout the project.

## 14. Anti-drift implementation checklist

Before claiming a substantial feature or refactor complete, report:

- which architectural root owns the new code;
- how related functionality is grouped inside that root;
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

# Contributor checks

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
