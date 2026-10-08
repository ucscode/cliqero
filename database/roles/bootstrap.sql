\set ON_ERROR_STOP on
\i /opt/cliqero/migrations/001_initial_schema.sql
\i /opt/cliqero/roles/provision-runtime-role.sql
\i /opt/cliqero/roles/harden-runtime-triggers.sql
