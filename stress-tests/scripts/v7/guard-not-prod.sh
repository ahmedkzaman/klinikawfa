#!/usr/bin/env bash
# v7 staging guard.
#
# Structural URL parsing (not substring matching):
#   * STAGING_API_URL must EXACTLY equal https://<STAGING_PROJECT_REF>.supabase.co
#   * STAGING_DB_URL must parse and be demonstrably associated with the SAME
#     staging project ref, either:
#       (a) Direct connection: host == db.<ref>.supabase.co
#       (b) Pooler:            host ends in ".pooler.supabase.com"
#                              AND (URL-decoded username == "postgres.<ref>"
#                                   OR decoded ?options= "project=<ref>"
#                                   OR decoded ?project=<ref>)
#   * Reject suffix-spoofed hosts (e.g. evil-db.<ref>.supabase.co.attacker.tld)
#   * Reject refs occurring only in password or unrelated query params.
#   * Continue rejecting the production ref anywhere in the parsed structure.
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

# --- Structural DB URL validation (Python: no substring tricks) ---
if ! command -v python3 >/dev/null 2>&1; then
  echo "FATAL: python3 is required for structural STAGING_DB_URL validation." >&2
  exit 2
fi

STAGING_DB_URL="$STAGING_DB_URL" \
STAGING_PROJECT_REF="$STAGING_PROJECT_REF" \
PROD_REF="$PROD_REF" \
python3 - <<'PY'
import os, sys, re
from urllib.parse import urlsplit, parse_qs, unquote

url  = os.environ["STAGING_DB_URL"]
ref  = os.environ["STAGING_PROJECT_REF"]
prod = os.environ["PROD_REF"]

def die(msg):
    print(f"FATAL: {msg}", file=sys.stderr); sys.exit(2)

try:
    p = urlsplit(url)
except Exception as e:
    die(f"STAGING_DB_URL parse error: {e}")

if p.scheme not in ("postgres", "postgresql"):
    die(f"STAGING_DB_URL scheme must be postgres/postgresql, got {p.scheme!r}")

host = (p.hostname or "").lower()
if not host:
    die("STAGING_DB_URL has no host")

user = unquote(p.username or "")
qs   = parse_qs(p.query, keep_blank_values=True)

# Extract explicit "project=<ref>" from ?project= or ?options=project=<ref>.
project_opt = None
if "project" in qs and qs["project"]:
    project_opt = qs["project"][0]
elif "options" in qs and qs["options"]:
    opts = unquote(qs["options"][0])
    # tolerate "-c project=xxx" or "project=xxx"
    m = re.search(r"project=([a-z0-9]{20})", opts)
    if m:
        project_opt = m.group(1)

# --- classify + validate association ---
DIRECT_HOST  = f"db.{ref}.supabase.co"
POOLER_SFX   = ".pooler.supabase.com"
EXPECTED_USR = f"postgres.{ref}"

associated = False
kind = "unknown"

if host == DIRECT_HOST:
    kind = "direct"
    associated = True
elif host.endswith(POOLER_SFX) and host != POOLER_SFX.lstrip("."):
    kind = "pooler"
    if user == EXPECTED_USR:
        associated = True
    elif project_opt is not None and project_opt == ref:
        associated = True
    else:
        die(f"pooler host {host!r} but neither username nor project option matches ref {ref!r}")
else:
    die(f"STAGING_DB_URL host {host!r} is not db.{ref}.supabase.co and not a *.pooler.supabase.com host")

if not associated:
    die("STAGING_DB_URL not demonstrably associated with STAGING_PROJECT_REF")

# --- reject production ref anywhere in parsed structure (not password) ---
# Password is intentionally ignored: a random password may collide with a
# 20-char alnum ref by pattern only. We check the structural fields only.
def contains_prod(s: str) -> bool:
    return prod in (s or "")

if contains_prod(host):
    die("STAGING_DB_URL host contains production ref")
if contains_prod(user):
    die("STAGING_DB_URL username contains production ref")
if project_opt and prod == project_opt:
    die("STAGING_DB_URL project option equals production ref")
if contains_prod(p.path or ""):
    die("STAGING_DB_URL path contains production ref")

print(f"OK: v7 staging guard passed (kind={kind}, host={host})")
PY

echo "OK: v7 staging guard passed (ref pattern + API exact + DB structurally associated + not-prod)"
