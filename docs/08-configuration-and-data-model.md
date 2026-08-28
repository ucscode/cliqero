# Configuration and Data Model

[Back to documentation index](./README.md)

## Configuration philosophy

Cliqero separates deployment/bootstrap configuration, removable module/provider configuration, secrets, and runtime administrative settings.

The system must not place every value into environment variables.

## Environment variables

Environment variables should be reserved for platform/deployment/bootstrap concerns such as:

- application environment;
- application name;
- base domain;
- configuration path;
- database/bootstrap connection settings;
- Redis/bootstrap connection settings;
- infrastructure-specific startup values.

Provider secrets such as Paystack keys should not be treated as ordinary application environment variables.

## Module/provider configuration files

Removable provider-specific configuration should live with the provider/module configuration structure.

Conceptual example:

```text
config/
  modules/
    payment/
      paystack.example.yaml
      usdt-trc20.example.yaml
  secrets/
    payment/
      paystack.yaml
      usdt-trc20.yaml
```

Secret configuration must never be committed. Example files may document required structure without real credentials.

Deleting or disabling one provider should not prevent unrelated providers or modules from starting.

## Static configuration versus runtime configuration

Static/provider configuration answers deployment/provider questions such as credentials and endpoints.

Runtime configuration answers policy questions such as:

- is a provider enabled?
- what referral commission policy is active?
- what is the minimum withdrawal?
- are new listings allowed?
- is a provider in maintenance mode?

Runtime configuration belongs in persistent application storage and should be editable administratively where appropriate.

## Productless listing model

Cliqero must not model separate database entities for ebook, software, course, template, API, service, download, offer, or similar product categories unless a real requirement establishes a distinct invariant.

The core Listing schema should contain stable relational fields such as:

- listing ID;
- seller/account ID;
- title;
- description or primary presentation content;
- canonical price/money reference;
- destination URL/reference;
- status/visibility;
- created/updated timestamps.

Media and optional product-specific presentation data may use related generic structures or metadata.

## Metadata/EAV philosophy

Use EAV, JSON, key-value, or similarly extensible structures for peripheral, optional, or frequently changing attributes where relational integrity is not required.

Good candidates include:

- optional user/profile metadata;
- listing metadata;
- listing presentation attributes;
- destination metadata that does not determine authorization;
- provider runtime settings;
- feature flags;
- preferences;
- integration-specific non-secret hints.

Do not pre-create fields merely because a future kind of product might need them.

The rule is:

> Add data because a user requirement exists, not because a product category can be imagined.

## What must not be EAV

Core relational, authorization, and financial invariants remain explicit schema.

Examples include:

- account identity and ownership;
- listing ownership and stable identity;
- canonical price at purchase time;
- purchase buyer/listing/payment relationship;
- entitlement owner/listing/state;
- access-grant identity and token hash;
- ledger amount/currency/type;
- payment provider reference/status;
- wallet ownership;
- affiliate parent/relationship data;
- attribution records used for commission;
- idempotency records;
- audit identifiers.

> Core invariant data is relational. Peripheral/extensible data may be metadata/EAV.

## Purchase snapshot

A purchase must preserve the commercial terms that applied at checkout. Later listing edits must not rewrite history.

The purchase should snapshot or durably reference enough information to explain:

- what listing was bought;
- by whom;
- from whom;
- for what amount/currency/canonical value;
- through which payment;
- under what referral attribution;
- what entitlement resulted.

## Entitlement model

Entitlement should be explicit relational state rather than inferred from payment history on every access request.

Minimum V1 concept:

- entitlement ID;
- buyer/account ID;
- listing ID;
- originating purchase ID;
- state;
- created/updated timestamps.

Future properties such as expiration, consumption count, or scope may be added only when actual requirements need them.

## Access grant and source token

The listing destination is data. Authorization is not.

Do not treat possession of a destination URL, listing ID, buyer ID, entitlement ID, purchase ID, email, or other business identifier as sufficient proof of access.

`source` is a cryptographically random opaque bearer token. It is not JWT, JWE, or another self-contained claims document. It carries no authoritative product, buyer, purchase, entitlement, or pricing data.

The token maps to server-side access state owned by Cliqero.

A minimal access-grant record should conceptually contain:

- access-grant ID;
- entitlement reference;
- secure hash of the bearer token;
- state;
- created timestamp;
- optional last-used timestamp;
- optional expiry/revocation/consumption policy only when required.

Prefer storing a secure one-way hash of the token rather than the raw credential. The plaintext token should be returned only when issued and then presented by the buyer/destination as a bearer credential.

Use a cryptographically secure random generator with sufficient entropy. Do not generate source tokens from sequential IDs, deterministic hashes of known records, timestamps, emails, or ordinary non-security random functions.

## Server-side resolution

Cliqero resolves the source token internally, for example:

`source token -> access grant -> entitlement -> purchase -> listing -> buyer/seller`

The token itself does not encode those relationships.

This makes the server-side state authoritative and allows revocation, refund consequences, entitlement changes, access-policy changes, or future consumption rules to take effect without changing or decoding token claims.

## Access API and integration credentials

External destinations verify `source` through the Access API.

The destination/integration must authenticate independently to Cliqero. A source bearer token authorizes the access handoff; it is not also an API client credential.

Integration credentials, API keys, OAuth-style client credentials, signatures, or another provider mechanism may be used according to the eventual integration capability. The important boundary is that the verification API must know which integration is asking and enforce what information that integration may receive.

API responses should expose only the minimum context required by the caller.

Cliqero's own web application should use the same access capability contracts as external integrations. Future SDKs/libraries may wrap the API but must not duplicate authorization truth client-side.

## State over booleans

Important processes should use explicit status/state fields rather than collections of booleans.

Examples:

- listing state;
- purchase state;
- payment verification state;
- entitlement state;
- access-grant state;
- earning state;
- withdrawal state.

Explicit states improve auditability and prevent contradictory combinations.

## Configuration audit

Material runtime configuration changes should be auditable, including provider state, referral percentages, minimum withdrawal, listing policies, entitlement/access policy, integration credentials/policy, and moderation rules.

Audit information should include actor, previous value, new value, timestamp, and correlation/reference information where applicable.
