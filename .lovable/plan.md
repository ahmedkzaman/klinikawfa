

## Enforce 45h Minimum Per Week Per Staff

### Problem
The current generator only *warns* when a staff member has below 45 hours in a week. It doesn't actively ensure every staff member reaches the 45h minimum.

### Solution — Add a "top-up" pass after initial generation

After the main generation loop, iterate through each ISO week and each staff member. For any staff below 45h in a week where they have at least 1 shift, find days in that week where they're not yet assigned and swap them in (replacing the staff member with the most hours that week in that slot). Repeat until all staff hit 45h or no more swaps are possible.

### Changes to `src/pages/staff/admin/Roster.tsx`

1. **Post-generation top-up pass** (after line 194, before warning checks):
   - For each ISO week, identify staff below 45h
   - For each under-assigned staff member, find shift slots in that week where they're not already working that day
   - Swap them in by replacing the staff member who has the *most* hours that week in that slot
   - Continue until staff reaches 45h or no valid swaps remain

2. **Adjust the sorting preference** in the main `pickStaff` function to prioritize staff furthest from 45h, ensuring more even initial distribution

3. **Warning text update**: Change the below-45h warning to only fire after the top-up pass has exhausted all options (e.g., not enough days in a partial week at month boundaries)

### File changes
- 1 file edit: `src/pages/staff/admin/Roster.tsx`
- No database changes

