

## Add Manager Review View for Completed Appraisals

### Problem
When a manager/admin opens a completed appraisal, they only see their own evaluator response. There's no way to review all evaluators' submitted ratings or see a consolidated summary.

### Solution
Add a **"Review All Responses"** tab (visible to admins) in the AppraisalForm page that shows all evaluators' responses side-by-side in a read-only consolidated view.

### Changes

**`src/pages/staff/AppraisalForm.tsx`**:

1. Add a new tab **"Review"** to the TabsList, visible only to admins:
   ```
   {isAdmin && <TabsTrigger value="review">📊 Review All</TabsTrigger>}
   ```

2. Create a `ReviewPanel` component inside the file that:
   - Lists all evaluator responses grouped by section (B, C, D, E)
   - For each criteria, shows a table/grid with columns per evaluator role (Self, Manager, Peer, Nursing) displaying their rating and evidence
   - Shows average ratings per criteria across all submitted evaluators
   - Displays the Part F weighted scores from each evaluator
   - Shows Part G development objectives from both staff and evaluator perspectives
   - All fields are read-only

3. Add status controls for admins at the top:
   - Button to mark appraisal as "reviewed" or "completed"
   - Ability to set the final `overall_weighted_score` on the `performance_appraisals` record (averaged from all evaluators' section scores)

### UI Layout for Review Tab

```text
┌─────────────────────────────────────────────┐
│ Section B: Clinical Skills                  │
│ ┌─────────────┬──────┬───────┬──────┬─────┐ │
│ │ Criteria    │ Self │ Mgr   │ Peer │ Avg │ │
│ ├─────────────┼──────┼───────┼──────┼─────┤ │
│ │ Clin. Know  │  4   │  3    │  4   │ 3.7 │ │
│ │ Diag. Acc.  │  5   │  4    │  —   │ 4.5 │ │
│ └─────────────┴──────┴───────┴──────┴─────┘ │
│                                             │
│ Section C: Patient Satisfaction             │
│ (same table format)                         │
│                                             │
│ Section D: Attendance                       │
│ (same table format)                         │
│                                             │
│ Section E: KPIs (from Self response)        │
│ (KPI results table)                         │
│                                             │
│ Overall Scores by Evaluator                 │
│ ┌──────────┬───────┬───────┬───────┐        │
│ │ Section  │ Self  │ Mgr   │ Avg   │        │
│ ├──────────┼───────┼───────┼───────┤        │
│ │ B (30%)  │ 4.2   │ 3.8   │ 4.0   │        │
│ │ C (30%)  │ 3.9   │ 4.0   │ 3.95  │        │
│ └──────────┴───────┴───────┴───────┘        │
│                                             │
│ [Mark as Reviewed] [Complete & Finalize]    │
└─────────────────────────────────────────────┘
```

### No database changes needed
All data already exists in `appraisal_responses` and `performance_appraisals`. RLS already allows admins to view all responses. The finalize action updates `performance_appraisals.status` and `overall_weighted_score`.

