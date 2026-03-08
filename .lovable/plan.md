

## Align leave types to BioInnoTech format

### Changes

**`src/pages/staff/LeaveRequest.tsx`**
- Change `LEAVE_TYPES` from `['annual', 'sick', 'emergency', 'unpaid']` to `['Annual', 'Sick', 'Emergency']`
- Update default state from `'annual'` to `'Annual'`
- Update reset value after submit from `'annual'` to `'Annual'`
- Remove `capitalize` CSS class from display since values are already capitalized

**`src/components/staff/calendar/LeavePill.tsx`**
- Remove `capitalize` if present (values already capitalized)

**`src/pages/staff/admin/Requests.tsx`**
- Remove `capitalize` CSS class from leave_type display

No database changes needed -- `leave_type` is a free-text column.

