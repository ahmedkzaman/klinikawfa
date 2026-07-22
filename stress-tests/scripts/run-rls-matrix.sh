#!/usr/bin/env bash
# =============================================================================
# Guarded Phase-D RLS matrix runner.
#
# 1. Sources guard-not-prod.sh, which loads and binds the staging environment.
# 2. Requires credentials and validates every UID as a canonical UUID.
# 3. Runs TypeScript before touching the database.
# 4. Verifies every UID/email mapping and the Website Editor's exact sole role.
# 5. Seeds fixtures, then installs fail-closed cleanup traps.
# 6. Runs the guarded Bun RLS test files.
# 7. Returns test failure first, otherwise the real cleanup exit status.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.staging}"

# --- 1. Guard and single environment load ---------------------------------
# shellcheck source=guard-not-prod.sh
source "$SCRIPT_DIR/guard-not-prod.sh"

# --- 2. Required variables and UUID validation -----------------------------
REQUIRED_VARS=(
  STAGING_PROJECT_REF STAGING_DB_URL STAGING_API_URL STAGING_ANON_KEY STAGING_SERVICE_ROLE_KEY
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

UUID_PATTERN='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
UID_VARS=(
  RLS_LOCUM_UID RLS_RESIDENT_UID RLS_STAFF_UID RLS_OPS_UID
  RLS_OPS_STAFF_UID RLS_DOCTOR_ADMIN_UID RLS_ADMIN_UID
  RLS_SPECIAL_ADMIN_UID RLS_WEBSITE_EDITOR_UID RLS_GUEST_UID
)
for uid_var in "${UID_VARS[@]}"; do
  if [[ ! "${!uid_var}" =~ $UUID_PATTERN ]]; then
    echo "FATAL: $uid_var does not contain a canonical UUID." >&2
    exit 2
  fi
done

declare -A SEEN_UIDS=()
for uid_var in "${UID_VARS[@]}"; do
  uid="${!uid_var}"
  normalized_uid="${uid,,}"
  if [[ -n "${SEEN_UIDS[$normalized_uid]:-}" ]]; then
    echo "FATAL: duplicate actor UID configured for $uid_var." >&2
    exit 2
  fi
  SEEN_UIDS[$normalized_uid]="$uid_var"
done

# --- 3. TypeScript compile before any DB action ----------------------------
echo "→ bunx tsc --noEmit -p $ROOT_DIR/tsconfig.json"
( cd "$ROOT_DIR" && bunx tsc --noEmit -p tsconfig.json )

# --- 4. Read-only identity verification ------------------------------------
export PGOPTIONS="-c app.staging_project_ref=${STAGING_PROJECT_REF}"

verify_uid_email() {
  local uid_var="$1" email_var="$2" label="$3"
  local uid="${!uid_var}" email="${!email_var}" result
  result="$(
    psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 \
      -v VERIFY_UID="$uid" -v VERIFY_EMAIL="$email" -At <<'SQL'
SELECT CASE WHEN EXISTS (
  SELECT 1
  FROM auth.users
  WHERE id = :'VERIFY_UID'::uuid
    AND email = :'VERIFY_EMAIL'
) THEN 'ok' ELSE 'mismatch' END;
SQL
  )"
  if [[ "$result" != "ok" ]]; then
    echo "FATAL: ${label} UID does not map to ${email_var} in auth.users." >&2
    exit 2
  fi
  echo "OK: ${label} UID/email verified"
}

verify_exact_role() {
  local uid_var="$1" expected_role="$2"
  local uid="${!uid_var}" result
  result="$(
    psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 \
      -v VERIFY_UID="$uid" -v VERIFY_ROLE="$expected_role" -At <<'SQL'
SELECT CASE WHEN
  (SELECT count(*) FROM public.user_roles WHERE user_id = :'VERIFY_UID'::uuid) = 1
  AND EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = :'VERIFY_UID'::uuid
      AND role::text = :'VERIFY_ROLE'
  )
THEN 'ok' ELSE 'mismatch' END;
SQL
  )"
  if [[ "$result" != "ok" ]]; then
    echo "FATAL: ${uid_var} must have exactly the ${expected_role} role." >&2
    exit 2
  fi
  echo "OK: ${uid_var} exact role verified"
}

verify_no_roles() {
  local uid_var="$1" result
  local uid="${!uid_var}"
  result="$(
    psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 \
      -v VERIFY_UID="$uid" -At <<'SQL'
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_id = :'VERIFY_UID'::uuid
) THEN 'ok' ELSE 'has-roles' END;
SQL
  )"
  if [[ "$result" != "ok" ]]; then
    echo "FATAL: ${uid_var} already has role rows; seed ownership is ambiguous." >&2
    exit 2
  fi
  echo "OK: ${uid_var} has no pre-existing roles"
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
verify_exact_role RLS_WEBSITE_EDITOR_UID website_editor
verify_no_roles RLS_LOCUM_UID
verify_no_roles RLS_RESIDENT_UID
verify_no_roles RLS_STAFF_UID
verify_no_roles RLS_OPS_UID
verify_no_roles RLS_OPS_STAFF_UID
verify_no_roles RLS_DOCTOR_ADMIN_UID
verify_no_roles RLS_ADMIN_UID
verify_no_roles RLS_SPECIAL_ADMIN_UID
verify_no_roles RLS_GUEST_UID

# --- 5. Seed fixtures ------------------------------------------------------
export RLS_MATRIX_RUNNER=1

echo "→ seeding fixtures"
psql "$STAGING_DB_URL" -X \
  -v ON_ERROR_STOP=1 \
  -v STAGING_PROJECT_REF="$STAGING_PROJECT_REF" \
  -v PRODUCTION_PROJECT_REF="$PRODUCTION_PROJECT_REF" \
  -v RLS_LOCUM_UID="$RLS_LOCUM_UID" \
  -v RLS_RESIDENT_UID="$RLS_RESIDENT_UID" \
  -v RLS_STAFF_UID="$RLS_STAFF_UID" \
  -v RLS_OPS_UID="$RLS_OPS_UID" \
  -v RLS_OPS_STAFF_UID="$RLS_OPS_STAFF_UID" \
  -v RLS_DOCTOR_ADMIN_UID="$RLS_DOCTOR_ADMIN_UID" \
  -v RLS_ADMIN_UID="$RLS_ADMIN_UID" \
  -v RLS_SPECIAL_ADMIN_UID="$RLS_SPECIAL_ADMIN_UID" \
  -v RLS_WEBSITE_EDITOR_UID="$RLS_WEBSITE_EDITOR_UID" \
  -v RLS_GUEST_UID="$RLS_GUEST_UID" \
  -f "$ROOT_DIR/phase-d/seed-rls-matrix.sql"

# --- 6. Trap cleanup -------------------------------------------------------
CLEANUP_STATUS=0
cleanup() {
  echo "→ cleaning up fixtures"
  if psql "$STAGING_DB_URL" -X \
      -v ON_ERROR_STOP=1 \
      -v STAGING_PROJECT_REF="$STAGING_PROJECT_REF" \
      -v PRODUCTION_PROJECT_REF="$PRODUCTION_PROJECT_REF" \
      -v RLS_LOCUM_UID="$RLS_LOCUM_UID" \
      -v RLS_RESIDENT_UID="$RLS_RESIDENT_UID" \
      -v RLS_STAFF_UID="$RLS_STAFF_UID" \
      -v RLS_OPS_UID="$RLS_OPS_UID" \
      -v RLS_OPS_STAFF_UID="$RLS_OPS_STAFF_UID" \
      -v RLS_DOCTOR_ADMIN_UID="$RLS_DOCTOR_ADMIN_UID" \
      -v RLS_ADMIN_UID="$RLS_ADMIN_UID" \
      -v RLS_SPECIAL_ADMIN_UID="$RLS_SPECIAL_ADMIN_UID" \
      -v RLS_GUEST_UID="$RLS_GUEST_UID" \
      -f "$ROOT_DIR/phase-d/cleanup-rls-matrix.sql"; then
    CLEANUP_STATUS=0
  else
    CLEANUP_STATUS=$?
    echo "FATAL: fixture cleanup FAILED (exit ${CLEANUP_STATUS})." >&2
  fi
}
trap cleanup EXIT INT TERM

# --- 7. Run all three test files ------------------------------------------
TEST_STATUS=0
( cd "$ROOT_DIR" && bun test \
    phase-d/rls-matrix.fixture.test.ts \
    phase-d/website-cms.fixture.test.ts \
    phase-d/website-editor-wordpress-matrix.test.ts \
    phase-d/rls.test.ts ) || TEST_STATUS=$?

# --- 8. Final exit ---------------------------------------------------------
trap - EXIT INT TERM
cleanup

if [[ $TEST_STATUS -ne 0 ]]; then
  exit "$TEST_STATUS"
fi
exit "$CLEANUP_STATUS"
