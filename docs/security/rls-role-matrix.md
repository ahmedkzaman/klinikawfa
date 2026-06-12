# RLS Role Matrix and Policy Inventory Foundation

Status: PR 1 safe foundation only.

Scope guardrails:
- This document records expected role behavior for review and later test implementation.
- No production database is contacted by this PR.
- No migration is added or run by this PR.
- No schema, enum, helper function, or RLS policy is changed by this PR.
- Any later RLS policy tightening or live database validation must be approved separately before PR 2.

## Canonical role groups approved by DocM3d

| Canonical group | Raw roles included | Notes |
| --- | --- | --- |
| `special_admin` | `special_admin` | Top admin/superuser role, e.g. DocM3d account. Can do everything, including role assignment, secrets, production migration approval, and destructive actions. |
| `admin` | `admin` | Can use clinical workflows and the admin section in the staff portal. Cannot assign roles, view secrets, or perform destructive actions. |
| `doctor` | `doctor_admin`, `resident_doctor` | Treat both roles as one doctor group. Can access clinical workflows. Cannot access the admin section in the staff portal. |
| `ops` | `ops_staff`, `operations`, `staff` | Treat all three roles as one operations group. Can access operational workflows. Cannot access the admin section in the staff portal. |
| `locum` | `locum` | Can access assigned patient data only, including historical consultations/vitals for assigned patients. Can key in items and see stock quantity. Cannot see item prices. Cannot access the admin section. |
| `guest` | `guest`, unauthenticated users | Public/guest access only. No staff, clinical, admin, pricing, or secrets access. |

## High-level access matrix

Legend: `Allow` = expected to be permitted; `Deny` = expected to be blocked by frontend, Edge Function checks, and/or RLS as applicable; `Scoped` = only when the row belongs to the user's assignment/context.

| Capability / data area | special_admin | admin | doctor group | ops group | locum | guest |
| --- | --- | --- | --- | --- | --- | --- |
| Clinical portal access | Allow | Allow | Allow | Allow | Scoped | Deny |
| Admin staff portal access | Allow | Allow | Deny | Deny | Deny | Deny |
| Assign/change user roles | Allow | Deny | Deny | Deny | Deny | Deny |
| View secrets/configuration values | Allow | Deny | Deny | Deny | Deny | Deny |
| Destructive admin actions | Allow | Deny | Deny | Deny | Deny | Deny |
| Read all patients | Allow | Allow | Allow | Allow | Deny; assigned patients only | Deny |
| Search/export patient records | Allow | Allow | Allow | Allow | Deny; assigned patients only | Deny |
| Historical consultations/vitals | Allow | Allow | Allow | Allow | Scoped to assigned patients only | Deny |
| Key in consultation/order/service items | Allow | Allow | Allow | Allow if workflow requires | Scoped to assigned patients only | Deny |
| View item prices/costs | Allow | Allow | Allow | Allow | Deny | Deny |
| View stock quantity | Allow | Allow | Allow | Allow | Allow | Deny |
| Create/update/delete payments | Allow | Allow | Allow | Allow | Deny | Deny |
| View panel claims | Allow | Allow | Allow | Allow | Deny | Deny |
| View e-invoices/tax/billing data | Allow | Allow | Deny | Allow | Deny | Deny |
| Void/refund/delete financial records | Allow | Allow | Deny | Allow | Deny | Deny |
| Update package/pricing/vendor invoices | Allow | Allow | Deny | Deny | Deny | Deny |
| Video room lookup | Allow | Allow | Allow | Allow | Deny | Deny |
| Video room lookup may return patient name | Allow | Allow | Allow | Allow | Deny | Deny |
| Create/end video rooms | Allow | Allow | Allow | Allow | Deny | Deny |
| Charge additional video payment | Allow | Allow | Allow | Allow | Deny | Deny |
| Anonymous public review insert | Deny by default; use moderated flow | Deny | Deny | Deny | Deny | Deny |

## Open design decisions requiring Irfan recommendation before implementation

### Payment mutation: direct table policy vs RPC vs Edge Function

DocM3d requested an explanation before deciding. PR 1 does not implement this. Future recommendation should compare:
- Direct table policy: simplest for frontend, but business rules and audit/idempotency are harder to centralize.
- RPC-only: centralizes validation, audit, and allowed transitions while still callable from Supabase clients.
- Edge Function-only: best when Stripe/service-role/secrets are involved, but adds endpoint maintenance and auth checks.
- Suggested default for payment-critical flows: use RPC/Edge Function for writes and keep direct table writes denied or very narrow, with Stripe webhook as the authoritative external payment confirmation source.

### Payment verify endpoint plus Stripe webhook both updating DB

DocM3d said both should be possible, but wants implications explained. Future implementation must address:
- Duplicate updates/race conditions if redirect verify and webhook process the same Stripe session.
- Need idempotency key / processed event table / transaction-safe state transitions.
- Decide source of truth: webhook should usually be authoritative; verify endpoint can refresh/read status or perform safe idempotent reconciliation.

### Public appointment submission rate limit

DocM3d thinks the current limit seems OK but wants Irfan's advice. Future review should inspect actual configured thresholds, abuse patterns, clinic capacity, and whether CAPTCHA/honeypot/backoff is needed.

### Public reviews

DocM3d clarified anonymous public insert should not remain allowed. Future implementation should propose a moderated workflow, for example staff-created review request tokens, authenticated moderation, spam controls, and no direct anonymous insert into final public review records.

### Rollout / staging / feature flag

Staging Supabase availability is unknown. Production DB migration window approval belongs to `special_admin` only. Future implementation should propose:
- Prefer disposable local DB or staging before production.
- Backup before every production migration.
- Low-traffic deployment window.
- Rollback migration/policy restore script per PR.
- Feature flag or compatibility layer (safe views/RPCs) before tightening policies that frontend still depends on.

## PR 1 test foundation expectations

This PR adds a static test matrix fixture and unit tests that verify the role grouping and key DocM3d rules remain documented in code. These are scaffolding tests only: they do not connect to Supabase, do not require database secrets, and do not prove that live RLS already satisfies the matrix.

The fixture is in `docs/security/rls-test-matrix.json`. Future PRs can extend it into integration tests that run against a disposable/local Supabase database or a separately approved staging database.

## Policy inventory workflow for staging/manual use

Use `scripts/dump-pg-policies.sql` to dump active policies from a database that has been explicitly approved for inspection, preferably staging or a local clone. The query is read-only and selects from PostgreSQL catalog views.

Example manual staging command, only after selecting a non-production connection string:

```bash
psql "$STAGING_DATABASE_URL" -f scripts/dump-pg-policies.sql -o rls-policy-inventory.tsv
```

Safety notes:
- Do not set `STAGING_DATABASE_URL` to production.
- Do not run this against production unless DocM3d explicitly approves production read-only inspection.
- The query does not contain `ALTER`, `DROP`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `GRANT`, `REVOKE`, or migration commands.
- Keep generated inventory output out of git if it may contain sensitive table/policy naming context.

## Required approvals before PR 2

Before any real RLS hardening, schema changes, migrations, or live database checks:
1. Confirm target environment: local disposable DB, staging, or production read-only.
2. Confirm access method and credentials owner.
3. Approve exact SQL/migration plan and rollback plan.
4. Confirm whether production database access is allowed. Default is **not allowed**.
5. Approve policy changes for each affected table/capability in this matrix.
6. Confirm payment mutation design after reviewing RPC vs Edge Function vs direct table implications.
7. Confirm staging/rollback/feature-flag plan.
