
# Add Team Management to Admin Dashboard

## Overview
Create a new admin section to manage doctors and staff members dynamically. This will replace the hardcoded data currently in the Doctors page with database-driven content.

## What You'll Get
- A new "Pasukan" / "Team" section in the admin sidebar
- Ability to add, edit, and delete doctors and staff
- Upload profile photos for each team member
- Add special interests, qualifications, and bio in both Malay and English
- The public Doctors page will display data from the database instead of hardcoded content

---

## Implementation Steps

### 1. Database Setup
Create a new `team_members` table with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| type | text | "doctor" or "staff" |
| name_ms | text | Name in Malay |
| name_en | text | Name in English |
| title_ms | text | Job title in Malay |
| title_en | text | Job title in English |
| qualifications | text[] | Array of qualifications (e.g., MBBS, Family Medicine) |
| years_experience | integer | Years of experience |
| expertise_ms | text[] | Special interests in Malay |
| expertise_en | text[] | Special interests in English |
| bio_ms | text | Biography in Malay |
| bio_en | text | Biography in English |
| photo_url | text | URL to profile photo |
| display_order | integer | Order to display on page |
| is_active | boolean | Whether to show on public page |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

Storage bucket: Create a `team-photos` bucket for profile images.

RLS Policies:
- Anyone can view active team members (for public page)
- Staff/Admin can manage all team members

### 2. Create Admin Page: Team Management
**File:** `src/pages/admin/TeamManagement.tsx`

Features:
- List all team members in a table/card view
- Filter by type (Doctor / Staff)
- Add new team member with form
- Edit existing team member
- Upload/change profile photo
- Toggle active/inactive status
- Reorder team members

### 3. Create/Edit Team Member Form
**File:** `src/pages/admin/TeamEditor.tsx`

Form fields:
- Type dropdown (Doctor / Staff)
- Name (MS / EN)
- Title (MS / EN)
- Qualifications (tag input)
- Years of experience
- Special interests (tag input, MS / EN)
- Bio textarea (MS / EN)
- Photo upload
- Active toggle

### 4. Update Admin Sidebar
**File:** `src/components/admin/AdminSidebar.tsx`

Add new menu item:
- Icon: UserCog or Stethoscope
- Title MS: "Pasukan"
- Title EN: "Team"
- URL: `/admin/team`

### 5. Update Routes
**File:** `src/App.tsx`

Add routes:
- `/admin/team` - TeamManagement page
- `/admin/team/new` - New team member
- `/admin/team/:id` - Edit team member

### 6. Update Public Doctors Page
**File:** `src/pages/Doctors.tsx`

Change from hardcoded data to:
- Fetch team members from database
- Filter doctors and staff separately
- Display dynamically with loading state
- Fallback message if no team members found

---

## Files to Create
1. `src/pages/admin/TeamManagement.tsx` - List/manage team members
2. `src/pages/admin/TeamEditor.tsx` - Add/edit form

## Files to Modify
1. Database migration - Create `team_members` table + storage bucket
2. `src/components/admin/AdminSidebar.tsx` - Add Team menu item
3. `src/pages/admin/index.ts` - Export new components
4. `src/App.tsx` - Add team routes
5. `src/pages/Doctors.tsx` - Use database data instead of hardcoded

---

## Technical Notes
- Photos will be stored in `team-photos` storage bucket (similar to gallery)
- Photo upload will use the same pattern as Gallery Management
- Bilingual support follows existing pattern (MS/EN fields)
- Medical terminology compliance: Use "special interest" and "vast experience" instead of "specialist" per project constraints
