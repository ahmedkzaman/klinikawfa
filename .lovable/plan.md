
# Plan: Add Staff Dashboard Link in Footer

## Overview

Add a "Staff Portal" link in the footer's bottom bar (bottom-left area). The link will only be functional for staff and admin users -- guests will see a disabled/non-clickable version.

## Changes

### 1. Update Footer (`src/components/layout/Footer.tsx`)

- Import `useAuth` from `AuthContext` and `Link` (already imported)
- In the bottom bar section, add a "Staff Portal" link on the left side (before the copyright text)
- Logic:
  - If user is staff or admin (`isStaffOrAdmin`): render a clickable `Link` to `/staff/dashboard`
  - If user is a guest (`isGuest`): render a disabled span (grayed out, cursor-not-allowed)
  - If user is not logged in: don't show the link at all

The link will appear subtly in the footer bottom bar, matching the existing text style (small, muted).

## Files Modified

| File | Change |
|------|--------|
| `src/components/layout/Footer.tsx` | Add conditional Staff Portal link in bottom bar |
