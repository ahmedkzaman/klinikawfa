#!/usr/bin/env bash
# =============================================================================
# Guarded Phase-D RLS matrix runner (v7).
#
# 1. Sources .env.staging via scripts/v7/guard-not-prod.sh.
# 2. Runs `bunx tsc --noEmit -p tsconfig.json` before touching the database.
# 3. Verifies every RLS_*_UID maps to its expected RLS_*_EMAIL in auth.users.
# 4. Seeds the v7 fixtures with the internal marker.
# 5. Runs both v7 test files.
# 6. Cleans up in FK order, passing all nine RLS_*_UID variables. If cleanup
#    fails the runner exits nonzero even when tests pass.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.staging}"

# --- 1. Guard --------------------------------------------------------------
"$SCRIPT_DIR/guard-not-prod.sh"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

REQUIRED_VARS=(
  STAGING_PROJECT_REF STAGING_DB_URL STAGING_API_URL STAGING_ANON_KEY
  RLS_LOCUM_UID RLS_LOCUM_EMAIL RLS_LOCUM_PASSWORD
  RLS_RESIDENT_UID RLS_RESIDENT_EMAIL RLS_RESIDENT_PASSWORD
  RLS_STAFF_UID RLS_STAFF_EMAIL RLS_STAFF_PASSWORD
  RLS_OPS_UID RLS_OPS_EMAIL RLS_OPS_PASSWORD
  RLS_OPS_STAFF_UID RLS_OPS_STAFF_EMAIL RLS_OPS_STAFF_PASSWORD
  RLS_DOCTOR_ADMIN_UID RLS_DOCTOR_ADMIN_EMAIL RLS_DOCTOR_ADMIN_PASSWORD
  RLS_ADMIN_UID RLS_ADMIN_EMAIL RLS_ADMIN_PASSWORD
  RLS_SPECIAL_ADMIN_UID RLS_SPECIAL_ADMIN_EMAIL RLS_SPECIAL_ADMIN_PASSWORD
  RLS_GUEST_UID RLS_GUEST_EMAIL RLS_GUEST_PASSWORD
)
for v in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "FATAL: required env var $v is empty." >&2; exit 2
  fi
done

# --- 1b. Strict canonical UUID validation for every RLS_*_UID -------------
# Refuse to run if any UID is not a lower-case canonical UUID. Prevents any
# SQL-metacharacter reaching psql regardless of interpolation path.
UUID_PATTERN='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
UID_VARS=(
  RLS_LOCUM_UID RLS_RESIDENT_UID RLS_STAFF_UID RLS_OPS_UID RLS_OPS_STAFF_UID
  RLS_DOCTOR_ADMIN_UID RLS_ADMIN_UID RLS_SPECIAL_ADMIN_UID RLS_GUEST_UID
)
for v in "${UID_VARS[@]}"; do
  if [[ ! "${!v}" =~ $UUID_PATTERN ]]; then
    echo "FATAL: $v is not a canonical lower-case UUID. Refusing to run." >&2
    exit 2
  fi
done

# --- 2. TypeScript compile before any DB write ----------------------------
echo "→ bunx tsc --noEmit -p $ROOT_DIR/tsconfig.json"
( cd "$ROOT_DIR" && bunx tsc --noEmit -p tsconfig.json )

# --- 3. UID ↔ email verification -----------------------------------------
export PGOPTIONS="-c app.staging_project_ref=${STAGING_PROJECT_REF}"

verify_uid_email() {
  local uid_var="$1" email_var="$2" role="$3"
  local uid="${!uid_var}" email="${!email_var}"
  local got
  # NEVER interpolate ${uid} into SQL text. Pass it as a safely quoted psql
  # variable and cast :'test_uid'::uuid inside the query.
  got="$(psql "$STAGING_DB_URL" \
      -v ON_ERROR_STOP=1 \
      -v test_uid="$uid" \
      -Atqc "SELECT email FROM auth.users WHERE id = :'test_uid'::uuid")"
  if [[ "$got" != "$email" ]]; then
    echo "FATAL: ${role} UID does not map to ${email_var} in auth.users" >&2; exit 2
  fi
  echo "OK: ${role} UID↔email verified"
}
verify_uid_email RLS_LOCUM_UID          RLS_LOCUM_EMAIL          locum
verify_uid_email RLS_RESIDENT_UID       RLS_RESIDENT_EMAIL       resident
verify_uid_email RLS_STAFF_UID          RLS_STAFF_EMAIL          staff
verify_uid_email RLS_OPS_UID            RLS_OPS_EMAIL            operations
verify_uid_email RLS_OPS_STAFF_UID      RLS_OPS_STAFF_EMAIL      ops_staff
verify_uid_email RLS_DOCTOR_ADMIN_UID   RLS_DOCTOR_ADMIN_EMAIL   doctor_admin
verify_uid_email RLS_ADMIN_UID          RLS_ADMIN_EMAIL          admin
verify_uid_email RLS_SPECIAL_ADMIN_UID  RLS_SPECIAL_ADMIN_EMAIL  special_admin
verify_uid_email RLS_GUEST_UID          RLS_GUEST_EMAIL          guest

# --- 4. Seed fixtures -----------------------------------------------------
export RLS_MATRIX_RUNNER=1

seed_or_cleanup_args=(
  -v ON_ERROR_STOP=1
  -v STAGING_PROJECT_REF="$STAGING_PROJECT_REF"
  -v RLS_LOCUM_UID="$RLS_LOCUM_UID"
  -v RLS_RESIDENT_UID="$RLS_RESIDENT_UID"
  -v RLS_STAFF_UID="$RLS_STAFF_UID"
  -v RLS_OPS_UID="$RLS_OPS_UID"
  -v RLS_OPS_STAFF_UID="$RLS_OPS_STAFF_UID"
  -v RLS_DOCTOR_ADMIN_UID="$RLS_DOCTOR_ADMIN_UID"
  -v RLS_ADMIN_UID="$RLS_ADMIN_UID"
  -v RLS_SPECIAL_ADMIN_UID="$RLS_SPECIAL_ADMIN_UID"
  -v RLS_GUEST_UID="$RLS_GUEST_UID"
)

echo "→ seeding v7 fixtures"
psql "$STAGING_DB_URL" "${seed_or_cleanup_args[@]}" \
  -f "$ROOT_DIR/phase-d/v7/seed-rls-matrix.sql"

# --- 5. Trap cleanup ------------------------------------------------------
CLEANUP_STATUS=0
cleanup() {
  echo "→ cleaning up v7 fixtures"
  # NOTE: DO NOT write `if ! psql ...; then rc=$?; fi` — inside `if !` the
  # exit status $? is 0 (the negation succeeded), which would hide failure.
  # Instead run the command outside the condition and capture $? directly.
  set +e
  psql "$STAGING_DB_URL" "${seed_or_cleanup_args[@]}" \
    -f "$ROOT_DIR/phase-d/v7/cleanup-rls-matrix.sql"
  CLEANUP_STATUS=$?
  set -e
  if [[ $CLEANUP_STATUS -ne 0 ]]; then
    echo "FATAL: v7 fixture cleanup FAILED (exit ${CLEANUP_STATUS})." >&2
  fi
}
trap cleanup EXIT INT TERM

# --- 6. Run both v7 test files --------------------------------------------
TEST_STATUS=0
( cd "$ROOT_DIR" && bun test \
    phase-d/v7/rls-matrix.fixture.test.ts \
    phase-d/v7/rls.test.ts ) || TEST_STATUS=$?

# --- 7. Final exit --------------------------------------------------------
trap - EXIT INT TERM
cleanup

if [[ $TEST_STATUS -ne 0 ]]; then
  exit $TEST_STATUS
fi
if [[ $CLEANUP_STATUS -ne 0 ]]; then
  exit $CLEANUP_STATUS
fi
exit 0
