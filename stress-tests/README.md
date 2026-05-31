# Klinik Awfa — Stress Test Harness

Local-only stress test harness. **Never run against production.**

Production project ref: `ncysmppzfjtiekfnomdv` — the guard script will hard-fail if you try to point the harness at it.

---

## Phase 0 — Staging setup (manual, do NOT automate)

Project creation, region, and compute tier must match production exactly. Do this by hand in the Supabase dashboard so latency numbers are honest:

1. **Create a new Supabase project** in the dashboard:
   - Region: **Singapore (ap-southeast-1)** — same as production
   - Compute tier: **same as production** (check the prod project's compute size in `Settings → Compute & Disk` and pick the identical size)
   - DB password: store in your password manager
2. **Apply migrations**:
   ```bash
   supabase link --project-ref <new_ref>
   supabase db push
   ```
3. **Auth providers**: configure with dummy credentials only.
4. **Disable real integrations**:
   - Stripe → test-mode keys only
   - ElevenLabs / Gemini → no keys (functions short-circuit)
   - SMS / email → leave unconfigured
5. **Enable diagnostics** (in SQL editor):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
   ALTER SYSTEM SET auto_explain.log_min_duration = '200ms';
   ALTER SYSTEM SET auto_explain.log_analyze = on;
   SELECT pg_reload_conf();
   ```
6. **Populate `stress-tests/.env.staging`** — copy `.env.staging.example` and fill in:
   - `STAGING_PROJECT_REF`
   - `STAGING_DB_URL`  (full Postgres connection string)
   - `STAGING_ANON_KEY`
   - `STAGING_SERVICE_ROLE_KEY`
   - `STAGING_API_URL`  (e.g. `https://<ref>.supabase.co`)

The harness asserts `STAGING_PROJECT_REF` is populated and `!== ncysmppzfjtiekfnomdv` before doing anything.

---

## Local prerequisites

```bash
# Postgres client (psql, pg_dump)
which psql pg_dump

# Bun
which bun

# k6 (Phase B)
nix run nixpkgs#k6 -- version

# Playwright (Phase C)
cd stress-tests && bun install && bunx playwright install chromium
```

**Do not run this harness in CI.** A 50-VU k6 run concurrently with Playwright on a shared GitHub Actions runner will exhaust CPU/RAM and add fake latency to Phase A/B numbers.

---

## Running

```bash
cd stress-tests

# Snapshot before any destructive run
./scripts/snapshot.sh pre-run

# Full sequence (phases are sequential by design — never parallel)
bun run stress

# Or per phase
bun run stress -- --phase a
bun run stress -- --phase b
bun run stress -- --phase c
bun run stress -- --phase d
```

Reports land in `stress-tests/reports/{runId}/`.

---

## Phase summary

| Phase | What | Target |
|---|---|---|
| A | 250k patients / 1M queue / 500k items / 100k payments / 50k inv tx — bench real hook queries | No `Seq Scan` on hot tables; p95 budgets met |
| B | k6 × 50 VUs hammer SECURITY DEFINER RPCs | Exactly one winner; invariants hold |
| C | Playwright UI chaos (slow 3G, offline, double-click, MyKad offline, drug-label overflow, two-tab) | No frozen spinners >10s, no console errors |
| D | Per-role RLS abuse matrix | Every forbidden action returns the exact expected error |
| E | Side-car observability (`pg_stat_statements`, locks, edge logs) | Reports in `reports/{runId}/observe.md` |

---

## Out of scope

- No production access, ever.
- No staging-provisioning automation (manual dashboard only — see Phase 0).
- Missing-index findings from Phase A are **proposed** as migrations under `reports/{runId}/proposed-migrations/`, not applied automatically.
