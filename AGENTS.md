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
9. **Public API resources are singular, truthful, and operationally complete.**
   Every persisted concern exposed under `/api/*` must have one canonical
   public owner and enough API control to keep the system correct without
   manual database edits. Mutable persisted resources use the canonical CRUD
   shape: collection GET/POST, item GET/PATCH, and one collection-level
   `DELETE /api/resources/delete` accepting a JSON `ids` array for both
   single and bulk deletion. Do not expose item DELETE routes, query-parameter
   deletion, or separate `bulk-delete` routes. Do not invent mutable fields,
   fake PATCH behavior, or destructive DELETE semantics for append-only or
   historical facts merely to satisfy CRUD symmetry. Immutable financial or
   evidentiary facts must instead expose the public recovery controls required
   to repair their consequences safely: idempotent reconciliation, reversal,
   compensation/adjustment, reprocessing, or another explicit domain workflow.
   If an externally relevant failure can leave money, entitlement, or ownership
   in the wrong state, the public API is incomplete until an authorized
   operator/automation client can detect and repair that state safely and
   audibly. Do not duplicate the same concern under both `/api/*` and
   `/internal/*`; app-only/session-only workflows belong under `/internal/*`.
10. **Public OpenAPI is a complete executable contract.** Every public operation
   must have the correct resource/standalone tag, meaningful summary and
   description, explicit parameter/request schemas where applicable, explicit
   success-response schemas, and useful synthetic examples. Stable top-level
   contracts must not degrade to free-form objects such as `z.any()`,
   `z.unknown()`, unrestricted records, empty object schemas, or Swagger
   `additionalProp1` placeholders. Genuinely opaque provider/external data may
   be free-form only as an explicitly named nested field inside an otherwise
   typed contract.

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
Approve, Reject, Cancel, Confirm, Enable, Disable, Revoke, or Expire. Those
controls must submit through the same canonical update path when the caller's
intent is representable as a resource field/state change. The application
service may perform substantial validation, accounting, reservation, audit,
outbox, entitlement, or other domain consequences while processing that PATCH;
those consequences alone do not turn the HTTP operation into a command.

Reserve additional command-style methods/endpoints only for operations whose
requested intent cannot honestly be represented as resource-field mutation,
such as credential rotation or another distinct process with its own input and
result semantics. A command may change resource state as a consequence, but
state change alone is never sufficient justification for an action route.

Do not force genuinely non-CRUD workflows into the CRUD base merely for
uniformity. The purpose of the abstraction is to make ordinary resources
predictable and make true domain commands obvious exceptions.

This shared service/repository contract is also the default API-alignment model:

```text
GET    /resources           -> list
GET    /resources/{id}      -> get
POST   /resources           -> create
PATCH  /resources/{id}      -> update
DELETE /resources/delete    -> delete one or many
```

The canonical DELETE request uses a JSON body:

```json
{
  "ids": ["resource-uuid"]
}
```

The same endpoint handles a single ID or many IDs. IDs do not belong in delete
query parameters, and public APIs must not add separate item-delete or
`bulk-delete` routes. Resource-specific reads, queries, and genuine commands
may extend this surface where required.

### Public API resource completeness and route ownership are mandatory

The public HTTP API is a stable operational contract, not a mirror of whichever
buttons the current Cliqero UI happens to expose.

Classify each public persisted concern before deciding its HTTP surface:

1. **Mutable persisted resource** — an aggregate whose legitimate fields or
   lifecycle state may change after creation.
2. **Immutable financial/evidentiary fact** — a posted accounting fact,
   provider event/evidence record, completed distribution fact, ledger movement,
   transfer fact, or similar history whose original values must remain
   trustworthy.
3. **Standalone projection/policy/protocol/workflow** — a concern that is not an
   ordinary persisted resource.
4. **Internal/app-only concern** — a first-party/session workflow that is not
   part of the external API contract.

#### Mutable persisted resources use canonical CRUD

For every intentionally public mutable persisted resource, expose:

```text
GET    /api/resources           -> list
GET    /api/resources/{id}      -> get one
POST   /api/resources           -> create
PATCH  /api/resources/{id}      -> update
DELETE /api/resources/delete    -> delete one or many
```

The DELETE operation accepts a JSON body with a non-empty, duplicate-free,
bounded `ids` array. A one-element array is a single deletion; a larger array
is bulk deletion. There is no separate public bulk-delete endpoint and no
item-delete route.

Do not omit a legitimate CRUD operation because the first-party UI does not
currently use it. Route existence and caller authorization are separate
concerns. Capabilities, API scopes, domain validation, state machines, and
server-side invariants determine whether a particular caller may perform it.

PATCH must represent a real domain update. Do not invent fields such as
`operator_note`, `correction_note`, fake status values, or no-op mutations
merely to manufacture CRUD symmetry. DELETE must be semantically valid for the
resource; it is not the normal mechanism for undoing posted financial effects.

#### Immutable facts require recovery controls, not fake CRUD

An immutable fact is not exempt from API completeness. Its completeness is
measured by whether the system can recover from real operational failures
without rewriting history or requiring direct database access.

Do not add PATCH to rewrite immutable payment evidence, posted wallet transfer
facts, ledger entries, completed distribution facts, provider events, or other
append-only history merely because they are table-backed. Do not delete an
original financial fact as the normal way to reverse its economic consequence.

Instead expose the domain mechanisms needed to keep the system correct. Depending
on the resource, these may include:

- **reconciliation** — compare the authoritative/external fact with derived
  internal state and idempotently create any missing effects;
- **reversal** — record that a previously valid external or internal operation
  was reversed and create the required compensating effects;
- **adjustment/compensation** — append a signed corrective financial fact tied
  to the original operation;
- **reprocessing/retry** — safely retry worker-owned processing of existing
  evidence without duplicating side effects;
- **replacement/correction resource creation** — when the proper repair is a new
  auditable record rather than mutation of the original fact.

These are genuine domain operations and may be explicit command endpoints when
the requested intent cannot honestly be represented as ordinary field mutation.
They do not have to masquerade as PATCH.

Examples of the intended model:

- A distribution that omitted a beneficiary remains historical evidence; an
  earning adjustment compensates the beneficiary and references/correlates to
  the distribution.
- An overpaid distribution is corrected by an opposite earning adjustment or
  reversal record, not by rewriting the original allocation.
- A payment/funding event that succeeded externally but failed before producing
  its wallet credit is repaired by an idempotent reconciliation operation that
  creates the missing credit exactly once.
- A bank/provider payment that was credited and later reversed keeps the
  original payment and credit history; the reversal creates a compensating
  negative wallet/accounting movement and applies the platform's explicit
  insufficient-balance/debt/block policy when necessary.
- A wallet transfer is a posted accounting fact. If its economic effect needs
  correction, create a correlated compensating transfer/adjustment rather than
  independently editing its gross, fee, net, direction, or posted legs.
- A provider event remains immutable ingress evidence. If processing failed,
  expose controlled reprocessing/reconciliation instead of allowing callers to
  rewrite provider evidence or worker-owned processing history arbitrarily.

Root-only destructive cleanup may still exist where resource-aware hard deletion
is technically necessary and can preserve referential/accounting integrity, but
root deletion is an administrative cleanup mechanism, not the ordinary recovery
model for financial mistakes or reversals.

#### Every externally significant flow needs a deterministic recovery story

For each payment, funding, wallet, distribution, earnings, Treasury, entitlement,
and withdrawal flow, the public/operator API must answer all applicable failure
cases without manual SQL:

- What if the external operation succeeded but an internal side effect failed?
- What if an internal side effect was applied twice?
- What if the external operation is later reversed or charged back?
- What if the amount or beneficiary was wrong?
- What if a worker/process crashed after only part of the workflow completed?
- What if an operator must repair the issue months later?
- Can the repair be retried safely without duplicating money or entitlements?
- Can the system prove which actor/automation performed the repair and why?

If the answer to a realistic recovery case is "edit the database manually," the
domain/API is incomplete.

Local multi-record effects that live in the same database should be atomic where
possible. External providers cannot participate in the same database
transaction, so idempotency plus reconciliation is mandatory at that boundary.

Corrective operations must preserve accountability. Where applicable they carry
or persist actor identity, reason, source/reference to the original operation,
correlation identity, timestamps, and idempotency protection.

This requirement exists specifically so trusted external automation—including
an operator agent/model—can inspect the system, determine the discrepancy, and
invoke a safe API operation to restore the correct business state. Automation
must never require direct database mutation to repair normal operational
failures.

#### Resource grouping and ownership remain singular

Public API grouping follows actual resource/domain ownership. Distinct persisted
resources must not be collapsed into an umbrella group merely because they are
conceptually related. A shared domain may compose multiple resources internally,
but it does not erase their public ownership boundaries.

A genuine command may extend a mutable resource's CRUD surface when it represents
behavior that cannot be expressed as ordinary field mutation. Ordinary
state/status changes remain PATCH updates; reconciliation, compensating
accounting, credential rotation, provider reprocessing, and similar distinct
processes may remain explicit commands.

Endpoints that are genuinely not ordinary persisted resources, such as health
checks, computed projections, policies, protocol ingress, and standalone
workflows, are exempt from CRUD symmetry. Do not misclassify a mutable persisted
resource as a projection merely to avoid implementing legitimate CRUD, and do
not misclassify an immutable financial fact as mutable merely to force PATCH.

There must be only one authoritative HTTP surface for each public concern. If a
resource or recovery workflow is public under `/api/*`, Cliqero's own UI and
Operator application must use that same canonical API. Do not create or preserve
a parallel `/internal/*` implementation for the same public capability.

Internal versus public is determined by the intended client, not merely by
whether authentication is required. Browser/session workflows may be internal
even when they are unauthenticated at one step. In particular:

- `/api/me/*` is not a public resource family. Current-session concerns such
  as onboarding and current-user convenience/profile workflows belong under
  `/internal/*`.
- Password-reset UI workflows are first-party account/application concerns and
  belong under `/internal/*`, even when the initial request is anonymous.
- Blog preview creation/deletion is an editor/application concern and belongs
  under `/internal/*`; preview is not a public automation resource.
- Dashboard/overview composition is an application concern and belongs under
  `/internal/*`, not the public API.
- Platform/domain policy is not a `me` concern. A withdrawal policy, for
  example, belongs to the Withdrawal/platform domain.
- Optional provider/module mechanics must not distort the provider-neutral
  public resource contract. Provider protocol ingress and provider-specific
  processing remain at the provider/module boundary, but any operational
  recovery needed by external automation must still have an authorized public
  control path where appropriate.

Do not use `/internal/*` as a second implementation of a public resource and
do not use `/api/*` for first-party-only convenience workflows. When an
existing route violates this distinction, migrate callers to the correct
canonical surface and remove duplicate/incorrect compatibility clutter.

### Public OpenAPI contract quality is mandatory

The generated OpenAPI document and Swagger UI are part of Cliqero's public API
contract. A route is not complete merely because its method and path appear in
Swagger.

Every public operation must provide, where applicable:

- exactly one correct resource or standalone-concern tag;
- an accurate summary and description;
- typed path/query/header parameters;
- an explicit request-body schema;
- an explicit successful-response schema;
- accurate response descriptions;
- useful synthetic request/response examples.

Stable top-level public request and response contracts must not use generic
free-form schemas such as `z.any()`, `z.unknown()`, unrestricted
`z.record(...)`, empty object schemas, or equivalents that render in Swagger
as `additionalProp1` placeholders. A genuinely opaque provider/external field
may remain free-form only as a named nested field in an otherwise explicit
resource schema.

Collection responses must explicitly describe their resource items and any
cursor, total, or summary fields. Item responses must explicitly describe the
resource shape. POST, PATCH, and DELETE request schemas must match what handlers
actually accept; do not document ignored fields or omit required fields.

Examples must use realistic synthetic values and actual enum/state values. Do
not expose real credentials, secrets, personal data, or production identifiers
in examples.

Copied or stale metadata is an API defect. A Checkout response must not carry an
Access Verification description, and a Distribution Policy response must not
inherit unrelated wording merely because a generic metadata helper was reused.

Distinct persisted resources must have distinct OpenAPI tags even when they
share a business domain. Broad catch-all tags such as `Core/System`,
`Internal UI`, or a domain umbrella containing several persisted resources are
not valid substitutes for resource ownership. Standalone projections, policies,
health checks, callbacks, webhooks, and protocol operations may have fewer than
five CRUD operations, but each still needs a narrowly accurate tag and complete
typed documentation.

Architecture tests should inspect the generated OpenAPI contract and protect
these invariants without becoming a second router implementation. In
particular, tests should prevent incomplete canonical CRUD, noncanonical delete
routes, public `bulk-delete` routes, top-level free-form stable contracts,
missing/incorrect tags, stale public app-only routes, and missing meaningful
operation metadata.

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

# Operator CRUD and recovery invariants

Operator-managed mutable resources must provide Create, Read, Update, and
Delete operations wherever those operations are truthful for the resource.
Archive, revoke, reject, disable, unpublish, and similar lifecycle actions are
status changes, not substitutes for Delete. Delete should physically remove a
mutable record when referential integrity permits it.

Immutable historical, financial, provider-evidence, and append-only records are
different: do not fabricate editable fields or destructive CRUD merely to make
their tables look symmetrical. Operator/API control is still mandatory, but it
must be expressed through the resource's real recovery mechanisms such as
reconciliation, reversal, compensation/adjustment, or controlled reprocessing.
An operator or trusted automation client must be able to resolve ordinary
production discrepancies without direct database edits.

Status/state is not special in Operator CRUD. When a mutable resource has a
status/state field, expose the supported states through its canonical update
contract, subject to the operator's authority. System-root operators may select
all legitimate domain states. Row controls such as Publish, Archive, Restore,
Approve, Reject, or Revoke may remain as UI conveniences only when they submit
through the canonical resource update operation. Do not create parallel
`publish()`, `archive()`, `restore()`, or similar service/repository methods
or action endpoints when the operation merely changes the persisted
status/state field.

Every mutable CRUD collection that supports row selection must provide Delete
for one or many selected resources through the same canonical server endpoint.
The browser sends one request containing an `ids` array and the server returns
per-record outcomes. Do not implement bulk deletion as one browser request per
row, and do not create a separate public `bulk-delete` API.

For immutable facts, Operator actions should surface the appropriate corrective
operation instead of Delete when Delete would erase the evidence needed to
explain balances or external events. Root-only destructive cleanup may exist
for exceptional maintenance when resource-aware cleanup preserves referential
and accounting integrity, but it must not replace reconciliation/reversal as
the normal operational remedy.

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

Application-owned encryption-at-rest uses the shared `APP_ENCRYPTION_KEY`
through the application encryption service. Derive purpose-specific keys from
that root; do not add feature-specific application-encryption variables when
cryptographic separation can be provided by purpose-specific derivation.
Authentication, signing, external-provider, and infrastructure secrets remain
separate. Keep root-key parsing and cryptographic primitives out of domain and
application services.

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
- Historical financial facts remain trustworthy records of what actually
  happened. Do not rewrite them to make the present state look correct.
  Correct their consequences with correlated reversal, reconciliation, or
  signed adjustment/compensation records.
- Immutability does not excuse missing operational control. Every externally
  significant monetary flow must expose enough authorized public API to inspect
  discrepancies and repair missed, duplicated, reversed, or incorrect effects
  without manual SQL.
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
  be idempotent and all legs share a stable correlation identity. Once posted,
  the transfer and its accounting legs are historical facts; correcting a wrong
  transfer means creating a correlated compensating transfer/adjustment, not
  independently editing the original gross, fee, net, direction, or legs.
  The public/operator API must expose the corresponding recovery operation so
  trusted automation can perform that correction safely.
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
- Missed side effects must be recoverable idempotently. If an external payment
  succeeded but its expected wallet credit, distribution, entitlement, or
  other internal effect is absent, reconciliation must be able to create the
  missing effect exactly once.
- Reversed external money must create compensating internal accounting rather
  than deleting the original payment/credit evidence.
- **Cliqero uses account-level debt for unrecoverable financial reversals.**
  Debt is canonical USD exposure owned by the account, not a negative balance
  attached to one wallet. Funding and earnings wallets remain ordinary
  non-negative accounting buckets; moving value between them must never allow
  an account to escape an outstanding debt.
- A reversal/correction first recovers value that is safely available to the
  account without rewriting historical facts. Recovery should consume the
  directly affected wallet first when that relationship is known, then other
  available account value where domain rules permit. Any remaining shortfall
  becomes explicit account debt. Reserved or already-paid-out value is not
  silently rewritten; pending value-out work must be stopped/released through
  its own domain workflow where still reversible.
- While account debt is greater than zero, server-side policy blocks new
  value-out operations that could increase Cliqero's exposure, including
  purchases and withdrawals. User-initiated wallet transfers are also blocked
  while debt exists because transfer fees or reclassification can reduce or
  obscure recoverable value. Credits/inflows and corrective operations remain
  allowed.
- Future account inflows settle outstanding debt before becoming spendable,
  regardless of whether the inflow originated as funding, seller/referral
  earnings, refund/recovery, or another canonical USD credit. The debt-settled
  portion must produce visible accounting history; only the remainder becomes
  available in the destination wallet.
- Account debt must itself be auditable and append-oriented: increases,
  settlements, and write-offs are explicit correlated records with source,
  reason, actor/system identity, timestamps, and idempotency. The current debt
  is derived from those records and must never become negative through
  over-settlement.
- Unrecovered debt is a receivable owed by the account, not an automatic
  company loss. Absorbing it requires an explicit, separately authorized,
  auditable write-off operation. Do not silently convert a failed recovery
  into company loss.
- Recovery/reversal operations must be atomic across the compensating wallet,
  earnings, Treasury, debt, reservation, entitlement, and other local effects
  that they touch. When an external provider is involved, use idempotent
  reconciliation around that external boundary.
- Money-creating financial POST operations require idempotency protection so
  retries cannot duplicate financial effects. Corrective/reconciliation
  operations require the same protection when retries could duplicate their
  effects.
- Append-only accounting history must correlate to a stable operation identity
  and must not require a mutable administrative Funding or Withdrawal row to
  remain forever.
- Operator/application HTTP calls use the canonical public `/api/*`
  resource whenever that resource is part of the external API contract. Do not
  duplicate a public resource under `/internal/*`. Use `/internal/*` only for
  first-party workflows that intentionally have no public resource contract,
  such as session/current-user convenience flows, previews, dashboard
  composition, and other app-only operations. There is no
  `/api/operator/*` namespace.

Operator Create forms live on dedicated `/new` pages rather than above
collection tables. Financial multi-leg operations share a structured
correlation ID across their persisted legs, including wallet transfers,
earnings adjustments, Treasury entries, reservations, and outbox events.
