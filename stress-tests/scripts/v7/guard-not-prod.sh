#!/usr/bin/env bash
# v7 staging guard.
#
# Adds two checks over v6:
#   * STAGING_API_URL must EXACTLY equal https://$STAGING_PROJECT_REF.supabase.co
#   * STAGING_DB_URL must be demonstrably associated with the SAME staging
#     project ref — either matches db.<ref>.supabase.co host or an AWS
#     pooler host whose querystring includes the ref
#     (options=project%3D<ref> or ?project=<ref>).
# Continues rejecting the production ref.
set -euo pipefail

ENV_FILE="${ENV_FILE:-$(dirname "$0")/../../.env.staging}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: $ENV_FILE not found. Copy .env.staging.example and fill it in." >&2
  exit 2
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

PROD_REF="${PRODUCTION_PROJECT_REF:-ncysmppzfjtiekfnomdv}"
REF_PATTERN='^[a-z0-9]{20}$'

for v in STAGING_PROJECT_REF STAGING_DB_URL STAGING_API_URL; do
  if [[ -z "${!v:-}" ]]; then
    echo "FATAL: $v is empty." >&2; exit 2
  fi
done

if [[ ! "$STAGING_PROJECT_REF" =~ $REF_PATTERN ]]; then
  echo "FATAL: STAGING_PROJECT_REF does not match ${REF_PATTERN}." >&2; exit 2
fi

if [[ "$STAGING_PROJECT_REF" == "$PROD_REF" ]]; then
  echo "FATAL: STAGING_PROJECT_REF == production ref." >&2; exit 2
fi

# --- API URL exact match ---
EXPECTED_API="https://${STAGING_PROJECT_REF}.supabase.co"
if [[ "$STAGING_API_URL" != "$EXPECTED_API" ]]; then
  echo "FATAL: STAGING_API_URL must equal ${EXPECTED_API}." >&2; exit 2
fi

# --- DB URL association ---
DB_OK=0
# db.<ref>.supabase.co host form
if [[ "$STAGING_DB_URL" == *"@db.${STAGING_PROJECT_REF}.supabase.co"* ]]; then
  DB_OK=1
fi
# pooler forms carrying the ref in querystring
if [[ "$STAGING_DB_URL" == *"project%3D${STAGING_PROJECT_REF}"* ]] \
   || [[ "$STAGING_DB_URL" == *"project=${STAGING_PROJECT_REF}"* ]] \
   || [[ "$STAGING_DB_URL" == *"?options=project%3D${STAGING_PROJECT_REF}"* ]] \
   || [[ "$STAGING_DB_URL" == *"&options=project%3D${STAGING_PROJECT_REF}"* ]]; then
  DB_OK=1
fi
if [[ $DB_OK -ne 1 ]]; then
  echo "FATAL: STAGING_DB_URL is not demonstrably associated with STAGING_PROJECT_REF." >&2
  exit 2
fi

# Explicit production-ref reject on the DB URL too.
if [[ "$STAGING_DB_URL" == *"$PROD_REF"* ]]; then
  echo "FATAL: STAGING_DB_URL contains production ref." >&2; exit 2
fi

echo "OK: v7 staging guard passed (ref pattern + API exact + DB associated + not-prod)"
