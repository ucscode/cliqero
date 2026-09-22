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

Payment provider configuration also owns the user-facing `display_name`,
`image_url`, and `description` metadata. Enabled provider files must define
these fields; their `config` sections remain server-side and must not contain
values intended for the browser. Funding uses canonical USD for account
credit, while collection and selectable payment currencies are provider facts.

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

For local identity bootstrapping, use the single application console rather
than editing PostgreSQL manually:

```text
just cli --help
just cli user:create --email operator@example.test --username operator --country NG
just cli user:capability operator@example.test system.root
```

## Development referral user tree

`just seed-users` creates a deterministic, real Better Auth user hierarchy for
local referral, promotion, hierarchy, earnings, withdrawal, and operator-flow
testing. It is separate from catalogue and blog fixtures, and it creates no
financial records. `just seed` includes this user fixture before the catalogue
and blog seeds.

The fixture tree is:

```text
tree_root
├── alpha
│   ├── alpha_one
│   │   ├── central_user
│   │   │   ├── central_left
│   │   │   │   ├── central_left_1
│   │   │   │   ├── central_left_2
│   │   │   │   └── central_left_3
│   │   │   ├── central_right
│   │   │   │   ├── central_right_1
│   │   │   │   └── central_right_2
│   │   │   └── central_leaf
│   │   └── alpha_peer
│   └── alpha_two
├── beta
│   ├── beta_one
│   └── beta_two
└── gamma
    └── gamma_one
```

These credentials are **DEVELOPMENT ONLY** and are disposable local fixture
credentials. Cliqero login uses email and password.

Every seeded development user uses the same predictable credentials:

```yaml
Email: <username>@example.test
Password: CliqeroTest!2026
```

For example, `tree_root` logs in as `tree_root@example.test` and
`central_user` logs in as `central_user@example.test`. These credentials are
development-only; never use them outside local or development environments.

`tree_root` is the development system-root/operator account for inspecting the
whole seeded hierarchy. `central_user` is a normal customer/promoter account
at depth 3 below `tree_root`, with two seeded downline generations.
