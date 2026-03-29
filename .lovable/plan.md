

## Weighted Fairness-Based Roster Generator

### What changes

Replace the current random selection logic with a **weighted random assignment** that prioritizes staff with fewer accumulated hours. Add a **fairness score** and **hour spread indicator** to the summary.

### Algorithm Redesign — `pickStaff` function (lines 142-193)

**Current**: Filters to staff below 45h, sorts by hours, picks randomly among tied-lowest.

**New weighted approach**:
1. Build eligible pool (same filtering as now: not assigned today, constraint checks, hour cap)
2. Calculate **weight** for each eligible staff: `weight = maxMonthHours - currentMonthHours + 1` (staff with fewer total monthly hours get higher weight)
3. Use **weighted random selection** — probability proportional to weight
4. This ensures staff with fewer hours are much more likely to be picked, but maintains some randomness for variety
5. Still prioritize staff below 45h/week first (existing logic stays), but within that group use weighted selection instead of uniform random

### Top-up Pass Enhancement (lines 198-298)

After the initial generation, add a **global balancing pass** that iterates the entire month:
- Calculate total monthly hours per staff
- Find the staff with the most hours and the staff with the fewest
- Attempt swaps between them on days where neither has a conflict
- Repeat until the hour spread (max - min) cannot be further reduced
- This runs after the existing per-week 45h top-up pass

### New: Fairness Score in Summary (after line 648)

Add a row below the summary table showing:
- **Hour Spread**: `{maxHours}h - {minHours}h = {spread}h difference`
- **Fairness Score**: Percentage indicator — `100 - ((spread / avgHours) * 100)`, clamped to 0-100%, displayed as a colored badge (green ≥90%, yellow ≥70%, red <70%)

### CSV Export Update (lines 347-378)

Add fairness score and hour spread to the exported CSV.

### File changes
- 1 file edit: `src/pages/staff/admin/Roster.tsx`
- No database changes

