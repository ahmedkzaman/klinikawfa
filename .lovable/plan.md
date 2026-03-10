

## Fix: KPI section showing empty in appraisal form

### Root Cause
The database default for `kpi_responses` is `'[]'::jsonb` (empty array). When loading the form, the code checks `Array.isArray(myResponse.kpi_responses)` — this returns `true` for the empty array, so it uses `[]` instead of calling `initKpis()` which would populate the 13 doctor KPIs.

### Fix in `src/pages/staff/AppraisalForm.tsx`

Line 143: Change the condition to also check array length:

```typescript
// Before
setKpis(Array.isArray(myResponse.kpi_responses) ? (myResponse.kpi_responses as KpiResponse[]) : initKpis());

// After  
const savedKpis = Array.isArray(myResponse.kpi_responses) && (myResponse.kpi_responses as KpiResponse[]).length > 0
  ? (myResponse.kpi_responses as KpiResponse[])
  : initKpis();
setKpis(savedKpis);
```

This ensures that when the DB returns an empty array (no KPIs saved yet), we initialize with the 13 default doctor KPIs instead of showing nothing.

