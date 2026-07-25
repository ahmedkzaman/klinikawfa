# Inventory Write Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow purchaser, staff_nurse, and doctor_admin to edit inventory and adjust stock while denying resident_doctor and locum.

**Architecture:** Add a dedicated `can_manage_inventory` database helper and use it only for inventory writes and inventory batch RPCs. Mirror the permission in the frontend role model without widening unrelated clinic permissions.

**Tech Stack:** Supabase PostgreSQL migrations, React/TypeScript, Vitest.

## Global Constraints

- Existing admin and operations inventory permissions remain allowed.
- Resident doctor and locum remain denied for inventory writes.
- Database authorization is authoritative; UI checks are convenience only.

### Task 1: Add role-aware inventory authorization

**Files:**
- Create: `supabase/migrations/20260725140000_inventory_write_permissions.sql`
- Modify: `src/contexts/AuthContext.tsx`
- Test: `src/test/inventory-write-permissions.test.ts`

- [ ] Write a failing migration contract test for the allowed and denied role sets.
- [ ] Run the focused test and confirm it fails because the migration is absent.
- [ ] Add enum values, helper, pricing trigger, inventory policies, and batch RPC guards.
- [ ] Add purchaser and staff_nurse to `AppRole` and inventory-management UI state.
- [ ] Run focused tests, lint, and production build.
