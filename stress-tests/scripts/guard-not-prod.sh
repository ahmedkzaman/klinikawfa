#!/usr/bin/env bash
# Fail closed unless every endpoint is the canonical endpoint for one validated
# non-production Supabase project. This file is sourced by run-rls-matrix.sh so
# the immutable production constant and validated environment remain in scope.
set -euo pipefail

readonly KNOWN_PRODUCTION_PROJECT_REF="ncysmppzfjtiekfnomdv"
GUARD_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$GUARD_SCRIPT_DIR/../.env.staging}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: $ENV_FILE not found. Copy .env.staging.example and fill it in." >&2
  exit 2
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ "${PRODUCTION_PROJECT_REF:-}" != "$KNOWN_PRODUCTION_PROJECT_REF" ]]; then
  echo "FATAL: PRODUCTION_PROJECT_REF must equal the immutable known production ref." >&2
  exit 2
fi
readonly PRODUCTION_PROJECT_REF="$KNOWN_PRODUCTION_PROJECT_REF"
export PRODUCTION_PROJECT_REF

REF_PATTERN='^[a-z0-9]{20}$'
if [[ -z "${STAGING_PROJECT_REF:-}" ]]; then
  echo "FATAL: STAGING_PROJECT_REF is empty. Refusing to run." >&2
  exit 2
fi
if [[ ! "$STAGING_PROJECT_REF" =~ $REF_PATTERN ]]; then
  echo "FATAL: STAGING_PROJECT_REF does not match ${REF_PATTERN}. Refusing to run." >&2
  exit 2
fi
if [[ "$STAGING_PROJECT_REF" == "$KNOWN_PRODUCTION_PROJECT_REF" ]]; then
  echo "FATAL: STAGING_PROJECT_REF equals the production ref. Refusing to run." >&2
  exit 2
fi

EXPECTED_API_URL="https://${STAGING_PROJECT_REF}.supabase.co"
if [[ "${STAGING_API_URL:-}" != "$EXPECTED_API_URL" ]]; then
  echo "FATAL: STAGING_API_URL must be the canonical URL for STAGING_PROJECT_REF." >&2
  exit 2
fi
if [[ "$STAGING_API_URL" == *"$KNOWN_PRODUCTION_PROJECT_REF"* ]]; then
  echo "FATAL: STAGING_API_URL contains the production ref. Refusing to run." >&2
  exit 2
fi

EXPECTED_DB_HOST="db.${STAGING_PROJECT_REF}.supabase.co"
ESCAPED_DB_HOST="${EXPECTED_DB_HOST//./\\.}"
DB_URL_PATTERN="^postgresql://postgres:[^@/[:space:]]+@${ESCAPED_DB_HOST}:5432/postgres(\\?[^#[:space:]]*)?$"
if [[ -z "${STAGING_DB_URL:-}" || ! "$STAGING_DB_URL" =~ $DB_URL_PATTERN ]]; then
  echo "FATAL: STAGING_DB_URL is not the canonical direct staging database URL." >&2
  exit 2
fi
if [[ "$STAGING_DB_URL" == *"$KNOWN_PRODUCTION_PROJECT_REF"* ]]; then
  echo "FATAL: STAGING_DB_URL contains the production ref. Refusing to run." >&2
  exit 2
fi

echo "OK: staging guard passed (immutable production ref + bound API/DB endpoints)"
