
# Klinik Awfa Stress Test Plan (revised)

Staging-only, locally-run harness covering DB scale, RPC contention, UI chaos, RLS abuse, and observability. Lives in `stress-tests/` and never touches production.

---

## Phase 0 — Staging setup

**Manual** (documented in `stress-tests/README.md`, no automation):

1. Create a new Supabase project in the **Singapore** region with the **same compute tier as production** (for parity with `ncysmppzfjtiekfnomdv`).
2. Apply every migration in `supabase/migrations/` via the Supabase CLI (`supabase db push --linked`).
3. Configure auth providers with dummy credentials. Stripe → test-mode key. ElevenLabs/Gemini → no keys (functions short-circuit).
4. Paste the new ref, DB URL, anon key, and service-role key into `stress-tests/.env.staging` (gitignored).
5. Enable `pg_stat_statements` + `auto_explain` (`min_duration = 200ms`) in the staging DB.

**Hard guard** — `stress-tests/scripts/guard-not-prod.sh` runs at the top of every script and exits non-zero if `STAGING_PROJECT_REF` is empty or equals `ncysmppzfjtiekfnomdv`.

**Snapshot** — `stress-tests/scripts/snapshot.sh` runs `pg_dump --schema-only` + a row-count manifest before and after each phase into `stress-tests/snapshots/{timestamp}/`.

---

## Phase A — Database Scale Test (full volume, no scale-down)

**Goal:** force the working set out of `shared_buffers` so missing indexes surface as real disk-bound seq scans.

### Seeder — `stress-tests/seed/seed.ts` (bun + faker + `postgres`)

Optimised for raw throughput, not for app correctness:

1. **Disable user triggers** on target tables for the duration of the load:
   ```sql
   ALTER TABLE public.patients          DISABLE TRIGGER USER;
   ALTER TABLE public.queue_entries     DISABLE TRIGGER USER;
   ALTER TABLE public.consultations     DISABLE TRIGGER USER;
   ALTER TABLE public.consultation_items DISABLE TRIGGER USER;
   ALTER TABLE public.payments          DISABLE TRIGGER USER;
   ALTER TABLE public.inventory_item_batches DISABLE TRIGGER USER;
   ALTER TABLE public.inventory_transactions DISABLE TRIGGER USER;
   ```
2. **Drop non-PK indexes** on target tables, load via `COPY ... FROM STDIN` in 50k-row chunks, then `CREATE INDEX CONCURRENTLY` to rebuild — same shape as prod migrations.
3. **Re-enable triggers** at the end and run `ANALYZE`.
4. Fixed RNG seed for reproducibility. Idempotent: re-running truncates target tables first (after confirming staging guard).

Volumes (kept exactly as requested):

| Table | Rows |
|---|---|
| `patients` | 250,000 |
| `queue_entries` | 1,000,000 |
| `consultations` | ~800,000 (derived) |
| `consultation_items` | 500,000 |
| `payments` | 100,000 |
| `inventory_transactions` | 50,000 |
| `inventory_item_batches` | derived from transactions |
| `panel_claims` | derived (sampled then inserted directly, since trigger is off) |

Distributions: realistic MyKad IC patterns, MY phone prefixes, 24-month spread, status-mix tuned to production ratios, item names sampled from the actual `inventory_items`/`services` tables.

### Benchmark — `stress-tests/phase-a/bench.ts`

Per query: `EXPLAIN (ANALYZE, BUFFERS)` once + 200-iteration timing loop (cold + warm). After the warm pass, flushes the kernel page cache between runs where possible (`pg_prewarm` reset trick on a dummy table). Outputs Markdown with p50/p95/p99, buffer hit ratio, and plan summary.

Queries (lifted verbatim from real hooks):
1. **Patient search** — `usePatients`: `ilike` on `name`/`phone`/`reg_no`/`national_id`.
2. **Today queue** — `useQueueEntries`: `created_at::date = current_date` + status filter + joins.
3. **Patient visit history** — `usePatientVisitHistory`.
4. **Checkout prep** — `DispenseCheckout`: consultation + items + payments.
5. **Inventory FEFO** — `inventory_item_batches` by `inventory_item_id` order by `expiry_date`.
6. **Panel claims** — `usePanelClaims` over 30-day range.

### Targets (p95)

| Query | Target |
|---|---|
| Patient search | < 200ms |
| Queue today | < 300ms |
| Checkout prep | < 300ms |
| FEFO batch | < 50ms |
| Visit history | < 250ms |
| Panel claims (30d) | < 400ms |

Any `Seq Scan` on `patients`, `queue_entries`, `consultations`, `consultation_items`, `payments`, `inventory_item_batches` = failure. Missing indexes are written up as proposed migrations under `stress-tests/reports/proposed-migrations/` (not applied).

---

## Phase B — RPC Contention Test (k6, local)

**Goal:** prove `SECURITY DEFINER` RPCs serialise correctly under concurrent fire.

`k6` is installed locally (`nix run nixpkgs#k6 --`), not added to npm deps. Each scenario: seed one target row → fire 50 VUs (`shared-iterations`, 50 iters, 50 VUs, `maxDuration: 30s`) against the staging PostgREST `/rpc/...` endpoint using a service-role JWT bound to a fake staff user.

### Scenarios

| Script | Target RPC | Expected success | Expected failures |
|---|---|---|---|
| `checkout-race.js` | `checkout_visit` on same `consultation_id` | 1 | 49 × `ALREADY_COMPLETED` |
| `fefo-race.js` | `commit_inventory_fefo` on same low-stock item | N (= stock) | rest report `shortfall>0` |
| `queue-status-race.js` | direct UPDATE of `queue_entries.clinic_status` | 1 | rest no-op |
| `settle-debt-race.js` | `settle_multiple_debts` on same payment_only entry | 1 | 49 × `ALREADY_COMPLETED`/`OVERPAYMENT` |
| `owe-slip-race.js` | `fulfill_owe_slip` on same slip | 1 | 49 × `SLIP_CLOSED`/`OVER_FULFILL` |

### Validators — `stress-tests/phase-b/validate.ts`

Post-run invariants (queried via `psql`):
- `SUM(payments.amount) <= consultation_total` per consultation
- `inventory_items.stock >= 0` and `stock >= allocated_quantity`
- `COUNT(DISTINCT queue_sequence) = COUNT(*)` per day
- No `consultations.status='completed'` with an open `queue_entries`
- `inventory_transactions` qty deltas reconcile against `inventory_item_batches.quantity_remaining`

Phase fails if any invariant breaks.

---

## Phase C — UI Chaos Test (Playwright, local)

Playwright runs locally against the staging preview URL with a logged-in cashier `storageState`. **k6 is never run in parallel with Playwright** — the orchestrator runs Phase B and Phase C strictly sequentially to avoid CPU/memory contention skewing latency.

### Cases

1. **Slow 3G** — full register → check-in → consult → checkout flow with throttling. No spinner > 10s; buttons toggle `disabled`.
2. **Offline mid-checkout** — `context.setOffline(true)` between Pay click and response. Expect recoverable toast + Retry; state preserved.
3. **Double-click guard** — `dblclick` Pay / Check-in / Dispense. Exactly 1 network call; button immediately disabled.
4. **Refresh after Pay click** — refresh mid-request. Visit ends either fully paid or untouched — never half (covered by Phase B locks).
5. **MyKad bridge offline** — block `127.0.0.1:8787`. Bridge dot turns red ≤12s; manual IC still works; "Read MyKad" times out in 3s and refocuses IC field.
6. **Drug label overflow** — print a label with 120-char medicine name + 400-char instructions. Capture print preview screenshot; assert ≤2 lines clip outside the 60×50mm frame.
7. **Two-tab same patient** — two contexts open same `queue_entry_id`, both attempt status change; loser gets a clean message.

Pass criteria: no unhandled promise rejection, no infinite spinner, no console error matching `/Error|TypeError|Unhandled/`.

---

## Phase D — Security / RLS Abuse Test

For each role (`guest`, `locum`, `operations`, `staff`, `doctor_admin`, `admin`, `special_admin`), seed an auth user, log in via password grant, run the abuse matrix and assert the **exact** error code/status.

| Actor | Target | Expected |
|---|---|---|
| `staff` | `admin_assign_role` | `NOT_AUTHORIZED` (42501) |
| `operations` | `consultations` INSERT for arbitrary patient | RLS deny |
| `locum` | `payments` SELECT outside own consultation | RLS deny |
| `guest` | `/clinic/*` HTTP | redirect `/auth` |
| `guest` | direct `GET /rest/v1/patients` | RLS deny |
| non-admin | `user_roles` UPDATE self → `special_admin` | RLS deny |
| any | `inventory_items` UPDATE `cost_price` | RLS deny unless permitted |
| `locum` | `panel_claims` SELECT | RLS deny |
| any | `appointment_submission_log` SELECT | RLS deny (write-only via RPC) |
| any | read `auth.users` | denied |

---

## Phase E — Observability (side-car)

`stress-tests/observe/watch.ts` runs throughout phases A–D:

- `supabase--db_health` every 30s (CPU, conns, WAL, deadlocks, OOM)
- `pg_stat_statements` top 20 by total_time, diffed per phase
- `pg_stat_activity` `wait_event` for Lock/LWLock during Phase B
- `pg_locks` snapshots during contention scripts
- `supabase--edge_function_logs` for every function (errors only)
- `supabase--analytics_query` for PostgREST 4xx/5xx and realtime join lag

Output: `stress-tests/reports/{runId}/observe.md` with CSVs + verdict.

---

## Orchestrator & layout

`bun run stress` runs phases **strictly in order** (A → B → C → D, observability side-car for all). `--phase a|b|c|d` scopes.

```text
stress-tests/
  .env.staging.example
  README.md                  # manual staging setup, run instructions, target tables
  package.json               # bun deps: faker, postgres, playwright (k6 binary external)
  scripts/
    guard-not-prod.sh
    snapshot.sh
  seed/
    seed.ts                  # trigger-disable + COPY + index rebuild
    fixtures/
  phase-a/
    bench.ts
    queries/*.sql
  phase-b/
    *.k6.js
    validate.ts
  phase-c/
    playwright.config.ts
    tests/*.spec.ts
  phase-d/
    rls.test.ts
    matrix.ts
  observe/
    watch.ts
  reports/                   # gitignored
  snapshots/                 # gitignored
```

---

## Out of scope

- No changes to production project, app code, or current migrations.
- No CI wiring (local-only by design — CI runners cannot give honest k6/Playwright numbers).
- Missing-index migrations from Phase A are proposed in reports, not applied.
- No staging-provisioning automation — manual dashboard setup only.
