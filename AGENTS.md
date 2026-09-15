# Cliqero engineering rules

These rules are architectural requirements, not suggestions. They apply to all
future implementation, refactoring, code review, and agent handoffs.

If existing code conflicts with these rules, report the conflict and fix the
architecture deliberately. Do not silently copy a bad existing pattern merely
because it already exists.

## 1. Domain grouping is mandatory

Group code by the domain it belongs to first. A developer opening a directory
must immediately understand what that part of the project owns.

Preferred shape:

```text
src/
  payment/
  withdrawal/
  catalogue/
  wallet/
  account/
  media/
```

Within a domain, group implementation details underneath that domain:

```text
payment/
  providers/
    paystack/
    nowpayments/
    direct-trc20/
    bank-transfer/
  application/
  domain/
  infrastructure/
  ui/
```

Do not encode missing directory structure into filenames such as:

```text
payment-paystack.ts
payment-nowpayments.ts
payment-paystack-logic.ts
listing-media.ts
listing-media-data.ts
```

Use directories to communicate ownership.

## 2. Unrelated provider families must not be mixed

`provider` is not a sufficient domain boundary.

Payment providers, media providers, AI providers, storage providers, and other
provider families must not be mixed in one generic provider directory merely
because they share the word "provider".

Use domain-first grouping:

```text
payment/providers/paystack/
media/providers/pexels/
ai/providers/openrouter/
```

Not:

```text
providers/
  paystack/
  pexels/
  openrouter/
```

## 3. Libraries first; custom infrastructure requires justification

Before implementing a substantial integration, protocol, infrastructure layer,
UI system, parser, validator, client, or framework-like abstraction manually,
first investigate whether a maintained library already solves the requirement.

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
- protocol implementations.

If a suitable maintained library exists, prefer installing and using it.
Custom implementation is the exception and must have a concrete technical
reason.

Do not rebuild an ecosystem library simply because the feature appears easy to
write. Less custom code is preferred when it produces a cleaner, safer, and
more maintainable system.

When implementing a new integration, explicitly check for an official SDK or a
well-maintained library before writing a custom client.

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

Preferred structure:

```text
src/
  payment/
    ...

tests/
  payment/
    ...
```

The test tree should mirror the source/domain structure where practical.

Avoid:

```text
src/payment/provider.ts
src/payment/provider.test.ts
src/payment/service.ts
src/payment/service.test.ts
```

Tests belong under the project test hierarchy unless a tool or framework has a
hard technical requirement that makes separation impossible. Any exception
must be explicit and narrowly scoped.

## 6. Static/reference data is not configuration

Static datasets, country/currency mappings, reference tables, and similar JSON
data are application data, not runtime configuration.

Store them under the application data hierarchy, for example:

```text
app/data/reference/country-currencies.json
```

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

Frontend ownership follows the same domain rules as backend ownership.

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

Directory names, class ownership, domain grouping, and dependency direction
must communicate the architecture without requiring repository-wide semantic
search.

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

## 13. Architecture before large refactors

Before moving or rewriting a large part of the project:

1. audit the current directory and dependency structure;
2. identify violations of these rules;
3. identify mature libraries that can replace custom infrastructure;
4. propose the target domain structure;
5. move code in coherent domain groups;
6. run validation after each coherent stage.

Do not perform a repository-wide move as an unreviewed mechanical shuffle.
The result must improve ownership and dependency direction, not merely rename
paths.

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
