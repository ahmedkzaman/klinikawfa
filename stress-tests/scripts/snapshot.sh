#!/usr/bin/env bash
# Snapshot schema + row-count manifest before/after a phase.
# Usage: ./snapshot.sh <label>     e.g. pre-phase-a, post-phase-b
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/guard-not-prod.sh" >/dev/null

# shellcheck disable=SC1090
set -a; source "$SCRIPT_DIR/../.env.staging"; set +a

LABEL="${1:?usage: snapshot.sh <label>}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="$SCRIPT_DIR/../snapshots/${TS}_${LABEL}"
mkdir -p "$OUT_DIR"

echo "Snapshot → $OUT_DIR"

pg_dump --schema-only --no-owner --no-privileges "$STAGING_DB_URL" \
  > "$OUT_DIR/schema.sql"

psql "$STAGING_DB_URL" -At -F $'\t' -c "
  SELECT schemaname || '.' || relname AS table, n_live_tup AS rows
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;
" > "$OUT_DIR/rowcounts.tsv"

psql "$STAGING_DB_URL" -At -c "
  SELECT pg_size_pretty(pg_database_size(current_database()));
" > "$OUT_DIR/db_size.txt"

echo "Done. Tables snapshotted: $(wc -l < "$OUT_DIR/rowcounts.tsv")"
