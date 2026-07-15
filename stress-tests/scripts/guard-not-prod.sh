#!/usr/bin/env bash
# Refuses to run unless STAGING_PROJECT_REF is set, matches the Supabase ref
# pattern, and is NOT the production ref.
set -euo pipefail

ENV_FILE="${ENV_FILE:-$(dirname "$0")/../.env.staging}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: $ENV_FILE not found. Copy .env.staging.example and fill it in." >&2
  exit 2
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

PROD_REF="${PRODUCTION_PROJECT_REF:-ncysmppzfjtiekfnomdv}"
REF_PATTERN='^[a-z0-9]{20}$'

if [[ -z "${STAGING_PROJECT_REF:-}" ]]; then
  echo "FATAL: STAGING_PROJECT_REF is empty. Refusing to run." >&2
  exit 2
fi

if [[ ! "$STAGING_PROJECT_REF" =~ $REF_PATTERN ]]; then
  echo "FATAL: STAGING_PROJECT_REF does not match Supabase ref pattern ${REF_PATTERN}. Refusing to run." >&2
  exit 2
fi

if [[ "$STAGING_PROJECT_REF" == "$PROD_REF" ]]; then
  echo "FATAL: STAGING_PROJECT_REF == production ref. Refusing to run." >&2
  exit 2
fi

if [[ -z "${STAGING_DB_URL:-}" ]]; then
  echo "FATAL: STAGING_DB_URL is empty." >&2
  exit 2
fi

if [[ "$STAGING_DB_URL" == *"$PROD_REF"* ]]; then
  echo "FATAL: STAGING_DB_URL contains production ref. Refusing to run." >&2
  exit 2
fi

echo "OK: staging guard passed (ref pattern + not-prod)"
