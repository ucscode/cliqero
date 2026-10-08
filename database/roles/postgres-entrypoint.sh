#!/usr/bin/env bash
set -euo pipefail

if [[ "${CLIQERO_DEPLOYMENT_MODE:-production}" == "production" ]]; then
  require_value() {
    local variable="$1"
    if [[ -z "${!variable:-}" ]]; then
      printf 'Production PostgreSQL startup requires %s.\n' "$variable" >&2
      exit 78
    fi
  }

  require_strong_password() {
    local variable="$1"
    local value="${!variable:-}"
    if (( ${#value} < 32 )) || [[ "${value,,}" == *cliqero* || "${value,,}" == "password" || "${value,,}" == "changeme" ]]; then
      printf 'Production PostgreSQL startup rejected an insecure %s.\n' "$variable" >&2
      exit 78
    fi
  }

  for variable in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD POSTGRES_APP_USER POSTGRES_APP_PASSWORD; do
    require_value "$variable"
  done
  if [[ "$POSTGRES_USER" == "$POSTGRES_APP_USER" ]]; then
    printf 'Production PostgreSQL bootstrap and runtime roles must be different.\n' >&2
    exit 78
  fi
  if [[ "${POSTGRES_USER,,}" == "cliqero" || "${POSTGRES_USER,,}" == "postgres" || "${POSTGRES_APP_USER,,}" == "cliqero_runtime" ]]; then
    printf 'Production PostgreSQL startup rejected a known development/default role name.\n' >&2
    exit 78
  fi
  require_strong_password POSTGRES_PASSWORD
  require_strong_password POSTGRES_APP_PASSWORD
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
