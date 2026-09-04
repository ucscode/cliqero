# Local authentication and fixture data

Runtime site identity lives in ignored `config/site.yaml`; copy the tracked
`config/site.example.yaml`. Grouped email delivery settings live in the ignored
`config/modules/email.yaml`; copy `config/modules/email.example.yaml`. The
development YAML points at the Compose service directly (`mailpit:1025`). The
development Compose override runs Mailpit at `http://localhost:8025` and routes
Better Auth verification and password-reset messages through SMTP on
`mailpit:1025`. Production uses the same transport abstraction with its own
YAML/SMTP settings and does not include Mailpit.

Registration stores the existing ISO 3166-1 alpha-2 country code. Better Auth
owns email verification and password-reset tokens; the application only
provides the delivery transport and return pages. Public auth requests use a
server-checked honeypot. Optional CAPTCHA enforcement is provider-neutral and
configured in ignored `config/security/captcha.yaml`; copy the tracked
`config/security/captcha.example.yaml`. Existing global/runtime values can be
referenced with `%env(NAME)%`, but secrets normally stay in the ignored YAML.

Representative data is explicit development-only data:

```text
just seed-catalogue
just seed-blog
just seed
```

The catalogue seed creates 16 listings (published, draft, archived, varied
lengths/prices/media metadata). The blog seed creates 20 SQLite posts (19
published, one draft) across categories and tags. Seeds refuse production
mode, are not run by `just dev`, and update deterministic fixture slugs/keys.
Blog data remains in the configured SQLite path and never enters PostgreSQL.
