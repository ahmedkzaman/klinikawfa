

# Plan: Add Admin Menu Items to Staff Sidebar + Restrict Stripe in Settings

## Overview

Add the content management menu items (currently only in the Admin sidebar) to the Staff portal sidebar, so staff can access those pages from the Staff portal. Also ensure Settings is accessible to staff but with Stripe integration hidden (already implemented in Settings.tsx).

## Changes

### 1. Update StaffLayout sidebar (`src/components/staff/StaffLayout.tsx`)

Add a new "Content Management" section to the staff sidebar with links to the admin pages:
- Dashboard (`/admin`)
- Leads / Appointments (`/admin/leads`)
- Team (`/admin/team`)
- Video Calls (`/admin/video-calls`)
- Blog Posts (`/admin/blog`)
- Gallery (`/admin/gallery`)
- Reviews (`/admin/reviews`)
- Users (`/admin/users`) -- admin only
- Settings (`/admin/settings`) -- visible to all staff, but Stripe hidden for non-admins

Each item will use the same icons as the Admin sidebar. Items like Users will be filtered to admin-only, matching the existing AdminSidebar behavior.

### 2. Update AdminSidebar (`src/components/admin/AdminSidebar.tsx`)

Change Settings `staffAccess` from `false` to `true` so staff can also access Settings from the Admin panel sidebar (Stripe is already hidden for non-admins in the Settings page itself).

## What's already handled

- **Stripe visibility**: The Settings page (`src/pages/admin/Settings.tsx` line 496) already wraps the Stripe Integration card with `{isAdmin && (...)}`, so staff will only see the Homepage Video settings when they visit Settings.

## Files Modified

| File | Change |
|------|--------|
| `src/components/staff/StaffLayout.tsx` | Add "Content Management" nav section with admin page links |
| `src/components/admin/AdminSidebar.tsx` | Change Settings `staffAccess` to `true` |

