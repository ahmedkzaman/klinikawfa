# Top Medications by Dispensed Visits Implementation Plan

**Goal:** Rank Insight's Top 10 Medications by distinct completed patient visits in which a positive quantity was dispensed.

**Architecture:** Keep the existing financial view as the source of completed medication lines and queue-entry IDs. Fetch the corresponding consultation-item identity and quantity fields, then pass those records to a pure ranking helper that deduplicates visits and returns the top ten.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase, Recharts, Vitest.

### Task 1: Add the medication visit ranking helper

**Files:**
- Create: `src/lib/clinic/medicationVisitRanking.ts`
- Test: `src/test/medication-visit-ranking.test.ts`

1. Add failing tests for duplicate lines in one visit, separate visits, zero quantities, identity grouping, legacy quantity fallback, and descending order.
2. Implement a pure helper using medication identity with normalized-name fallback and a set of queue-entry IDs.
3. Run the focused unit test.

### Task 2: Connect scoreboard data and chart

**Files:**
- Modify: `src/hooks/clinic/useScoreboards.ts`
- Modify: `src/components/clinic/insight/ScoreboardsTab.tsx`
- Test: `src/test/medication-visit-ranking.test.ts`

1. Fetch item identity and dispensed quantity for medication rows returned by the financial view.
2. Replace revenue ranking with the helper's distinct visit ranking.
3. Plot `Patient Visits`, use whole-number formatting, and show `By patient visits dispensed`.
4. Add source-level assertions for the chart labels and run the focused test.

### Task 3: Verify and deploy

1. Run changed-file lint, focused tests, the production build, and relevant existing scoreboard tests.
2. Commit the implementation, rebase onto the latest remote main branch, and rerun verification.
3. Push the verified commit to main, monitor deployment checks, and confirm the live bundle contains the new chart label.
