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

The secret configuration directory must never be committed.

The repository contains example configuration showing required keys and structure without real credentials.

Example:

```yaml
# paystack.example.yaml
public_key: ""
secret_key: ""
webhook_secret: ""
```

A deployment can mount secret configuration read-only into the relevant container.

Deleting a provider's secret/configuration should make that provider unavailable without preventing other providers or unrelated modules from starting.

## Static configuration versus runtime configuration

Static/provider configuration answers questions like:

- what credential authenticates Paystack?
- what network configuration does the TRC-20 provider use?
- what endpoint should a provider call?

Runtime configuration answers questions like:

- is Paystack currently enabled?
- are new campaigns allowed?
- what is the current minimum withdrawal?
- what referral levels are active?
- is a provider in maintenance mode?

Runtime configuration belongs in persistent application storage and should be editable through administrative interfaces where appropriate.

An administrator clicking `Disable Paystack` must not rewrite YAML files.

## Provider registry

Configuration identifies available providers, but consumers resolve them through the capability/provider registry.

A provider should be able to declare supported behavior such as:

- funding support;
- payout support;
- supported currencies;
- refund support;
- network/region restrictions;
- operational availability.

The calling system requests a compatible capability rather than hard-coding a provider switch statement.

## EAV philosophy

Cliqero should use EAV/key-value structures for peripheral, optional, or frequently extensible attributes to avoid database migrations for every minor new field.

Good EAV candidates include:

- optional user metadata;
- profile attributes;
- social/contact destination metadata;
- provider runtime settings;
- feature flags;
- preferences;
- non-critical offer metadata;
- campaign metadata that is not part of a financial/domain invariant.

## What must not be EAV

Core relational and financial invariants should remain explicit schema.

Examples include:

- account IDs and core identity relationships;
- ledger amount/currency/type;
- transaction reference/status;
- wallet ownership;
- campaign identity/status/budget reservation;
- affiliate parent/relationship data;
- action campaign attribution and status;
- idempotency records;
- audit identifiers.

The rule is:

> Core invariant data is relational. Peripheral/extensible data may be EAV.

## Advertiser destinations

Advertiser social/contact destinations should be modeled generically rather than as a growing list of hard-coded social-network columns.

A destination can represent:

- WhatsApp;
- phone;
- website;
- Instagram;
- Facebook;
- TikTok;
- Telegram;
- YouTube;
- custom/future destination types.

Offers reference reusable advertiser destinations or define their own override destination.

Adding a new supported destination type should not require restructuring every advertiser table.

## State over booleans

Important processes should use explicit status/state fields rather than collections of booleans.

Examples:

- campaign state;
- payment verification state;
- action qualification state;
- earning state;
- withdrawal state.

Explicit state machines improve auditability and prevent contradictory combinations.

## Configuration audit

Material runtime configuration changes should be auditable.

Examples:

- provider enabled/disabled;
- referral percentages changed;
- minimum withdrawal changed;
- campaign policies changed;
- moderation rule changed.

Audit information should include actor, previous value, new value, timestamp, and correlation/reference information where applicable.
