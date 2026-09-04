# Application console

The application console is the single developer/operator command entry point:

```bash
just cli --help
```

It provides `user:create`, `user:password`, `user:role`, `user:list` and
`user:show`. Passwords are prompted when omitted and are never printed.
`user:create` creates a Better Auth credential and linked Cliqero account;
`user:password` is a trusted server-side reset and does not require the old
password. It hashes through Better Auth's configured password utility and
persists through its internal credential adapter.

Capabilities currently modelled are `operator`, `catalogue_manager`, and
`blog_manager`. A normal user has no privileged capability. Bootstrap the first
operator with `just cli user:role admin@example.com operator`. Revoke with
`--revoke`; use `normal --revoke` to remove all privileged capabilities. The
console will not revoke the last operator.
