#!/usr/bin/env bash
# =============================================================================
# Guarded Phase-D RLS matrix runner.
#
# 1. Sources .env.staging and calls guard-not-prod.sh.
# 2. Runs `bunx tsc --noEmit` before touching the database.
# 3. Verifies every RLS_*_UID maps to its expected RLS_*_EMAIL in auth.users
#    (read-only). No credential values are ever echoed.
# 4. Exports RLS_MATRIX_RUNNER=1 and PGOPTIONS with the internal seed marker.
# 5. Seeds fixtures; on success installs `trap cleanup EXIT INT TERM`.
# 6. Runs both bun test files.
# 7. Final exit = test exit if non-zero, else cleanup exit.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.staging}"

# --- 1. Guard --------------------------------------------------------------
"$SCRIPT_DIR/guard-not-prod.sh"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

# --- 2. Required credential var presence check (no values echoed) ---------
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
  RLS_WEBSITE_EDITOR_UID RLS_WEBSITE_EDITOR_EMAIL RLS_WEBSITE_EDITOR_PASSWORD
  RLS_GUEST_UID RLS_GUEST_EMAIL RLS_GUEST_PASSWORD
)
for v in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "FATAL: required env var $v is empty." >&2
    exit 2
  fi
done

# --- 3. TypeScript compile before any DB write ----------------------------
echo "→ bunx tsc --noEmit -p $ROOT_DIR/tsconfig.json"
( cd "$ROOT_DIR" && bunx tsc --noEmit -p tsconfig.json )

# --- 4. UID ↔ email verification (read-only) -------------------------------
export PGOPTIONS="-c app.staging_project_ref=${STAGING_PROJECT_REF}"

verify_uid_email() {
  local uid_var="$1" email_var="$2" role="$3"
  local uid="${!uid_var}"
  local email="${!email_var}"
  local got
  got="$(psql "$STAGING_DB_URL" -Atqc \
    "SELECT email FROM auth.users WHERE id = '${uid}'::uuid")"
  if [[ "$got" != "$email" ]]; then
    echo "FATAL: ${role} UID does not map to ${email_var} in auth.users" >&2
    exit 2
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
verify_uid_email RLS_WEBSITE_EDITOR_UID RLS_WEBSITE_EDITOR_EMAIL website_editor
verify_uid_email RLS_GUEST_UID          RLS_GUEST_EMAIL          guest

# --- 5. Seed fixtures -----------------------------------------------------
export RLS_MATRIX_RUNNER=1

echo "→ seeding fixtures"
psql "$STAGING_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -v STAGING_PROJECT_REF="$STAGING_PROJECT_REF" \
  -v RLS_LOCUM_UID="$RLS_LOCUM_UID" \
  -v RLS_RESIDENT_UID="$RLS_RESIDENT_UID" \
  -v RLS_STAFF_UID="$RLS_STAFF_UID" \
  -v RLS_OPS_UID="$RLS_OPS_UID" \
  -v RLS_OPS_STAFF_UID="$RLS_OPS_STAFF_UID" \
  -v RLS_DOCTOR_ADMIN_UID="$RLS_DOCTOR_ADMIN_UID" \
  -v RLS_ADMIN_UID="$RLS_ADMIN_UID" \
  -v RLS_SPECIAL_ADMIN_UID="$RLS_SPECIAL_ADMIN_UID" \
  -v RLS_GUEST_UID="$RLS_GUEST_UID" \
  -f "$ROOT_DIR/phase-d/seed-rls-matrix.sql"

# --- 6. Trap cleanup ------------------------------------------------------
CLEANUP_STATUS=0
cleanup() {
  echo "→ cleaning up fixtures"
  if ! psql "$STAGING_DB_URL" \
        -v ON_ERROR_STOP=1 \
        -v STAGING_PROJECT_REF="$STAGING_PROJECT_REF" \
        -v RLS_SPECIAL_ADMIN_UID="$RLS_SPECIAL_ADMIN_UID" \
        -f "$ROOT_DIR/phase-d/cleanup-rls-matrix.sql"; then
    CLEANUP_STATUS=$?
    echo "FATAL: fixture cleanup FAILED (exit ${CLEANUP_STATUS})." >&2
  fi
}
trap cleanup EXIT INT TERM

# --- 7. Run all test files -------------------------------------------------
TEST_STATUS=0
( cd "$ROOT_DIR" && bun test \
    phase-d/rls-matrix.fixture.test.ts \
    phase-d/website-cms.fixture.test.ts \
    phase-d/rls.test.ts ) || TEST_STATUS=$?

# --- 8. Final exit --------------------------------------------------------
# Preserve test failure over cleanup failure.
trap - EXIT INT TERM
cleanup

if [[ $TEST_STATUS -ne 0 ]]; then
  exit $TEST_STATUS
fi
exit $CLEANUP_STATUS
