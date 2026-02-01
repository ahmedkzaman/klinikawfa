
# Update Public Doctors Page to Display Team Members from Database

## Overview

Replace the hardcoded doctor and staff data on the public Doctors page with dynamic data fetched from the `team_members` database table. This will allow administrators to manage the team through the admin panel and have changes automatically reflected on the public-facing page.

## Current State

- The Doctors page currently displays 2 hardcoded doctors and 2 staff categories
- The `team_members` table already exists with proper RLS policies (public can view only active members)
- Admin panel already supports full team management (add, edit, delete, reorder)

## Implementation Steps

### Step 1: Add Data Fetching Logic

Add state management and a Supabase query to fetch active team members:
- Create state for doctors and staff arrays
- Create loading and error states
- Fetch data on component mount
- Filter by type (doctor vs staff) for display in different sections

### Step 2: Update Doctors Grid Section

Modify the doctors grid to render from database data:
- Map over fetched doctors data instead of hardcoded array
- Display photo from `photo_url` or show placeholder icon if none
- Show name based on current language (`name_ms` or `name_en`)
- Display title, qualifications, expertise, and bio from the appropriate language fields
- Keep the experience badge and styling

### Step 3: Update Support Staff Section

Modify the staff section to render from database data:
- Filter team members by `type === 'staff'`
- Display staff members with their names, titles, and bios
- If no staff in database yet, show a simplified static message or placeholder

### Step 4: Handle Loading and Empty States

Add appropriate UI feedback:
- Show loading spinner while fetching data
- Display a friendly message if no doctors are found
- Gracefully handle the case where staff section might be empty

### Step 5: Remove Hardcoded Data

Clean up the file by removing:
- The hardcoded `doctors` array
- The hardcoded `staffTeam` array
- Unused icon imports that were specific to hardcoded data

---

## Technical Details

### Data Fetching Pattern

The query will use the existing Supabase client pattern seen in other pages:

```typescript
const { data, error } = await supabase
  .from('team_members')
  .select('*')
  .eq('is_active', true)
  .order('display_order', { ascending: true });
```

Note: Even though we filter by `is_active`, the RLS policy already enforces this, providing defense in depth.

### Type Safety

Use the existing `Tables` type from the Supabase types file:

```typescript
import { Tables } from '@/integrations/supabase/types';

type TeamMember = Tables<'team_members'>;
```

### Language Handling

The page already uses `useLanguage()` hook. Each database field has `_ms` and `_en` variants that will be selected based on the current language setting.

### File Changes

**Modified file:** `src/pages/Doctors.tsx`
- Add imports for Supabase client and types
- Add useState and useEffect for data fetching
- Replace hardcoded rendering with dynamic data
- Add loading state UI
- Remove unused hardcoded arrays

