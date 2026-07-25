# Unique Doctor Profile Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair duplicate doctor profiles and make current-doctor resolution race safe.

**Architecture:** A migration consolidates duplicate references before adding a partial unique index. The frontend lookup remains defensive during rollout and retries after an insert race.

**Tech Stack:** PostgreSQL, Supabase RLS, React Query, TypeScript, Vitest

## Global Constraints

- Preserve the established doctor profile and all historical references.
- Delete only redundant duplicate doctor rows.
- Non-clinical users must not auto-provision doctor profiles.

---

### Task 1: Regression Test

**Files:**
- Create: `src/test/current-doctor-uniqueness.test.ts`
- Modify: `src/hooks/clinic/useCurrentDoctor.ts`

- [ ] Write a source-level regression test requiring deterministic limited lookups and insert-race recovery.
- [ ] Run it and confirm failure before implementation.
- [ ] Implement the minimal lookup hardening.
- [ ] Run it and confirm success.

### Task 2: Database Repair

**Files:**
- Create: `supabase/migrations/<timestamp>_enforce_unique_doctor_profile.sql`

- [ ] Repoint `consultations.doctor_id` and `queue_entries.assigned_doctor_id` to the oldest doctor row for each account.
- [ ] Delete redundant rows.
- [ ] Add a partial unique index on non-null `user_id`.
- [ ] Apply the migration to production and query for remaining duplicates and the index definition.

### Task 3: Deployment

- [ ] Run the protected GitHub security, test, type-check, and build gate.
- [ ] Deploy the validated commit to GitHub Pages.
- [ ] Confirm the live Consultation route responds.
