
# Add Admin Dashboard Access

## Current Situation
The admin dashboard exists at `/admin` with full functionality (leads, blog, gallery, user management), but there's no way to access it from the website UI. Users need to:
1. Be logged in
2. Have an admin or staff role assigned
3. Manually type `/admin` in the URL

## Implementation Plan

### 1. Add Admin/Login Link to Header
Add a conditional link in the header that shows:
- "Login" button for unauthenticated users (links to `/auth`)
- "Admin" button for staff/admin users (links to `/admin`)
- User email/avatar with logout option for authenticated regular users

**File:** `src/components/layout/Header.tsx`

### 2. Quick Admin Access (Development)
To test the admin panel immediately, you'll need an admin role. I can help you:
- Create a database query to assign admin role to your account
- Or set up auto-assignment for the first registered user

---

## Technical Details

### Header Changes
```
- Import useAuth hook
- Add conditional rendering:
  - If not logged in: Show "Login" button
  - If logged in + isStaffOrAdmin: Show "Admin Panel" button
  - If logged in (regular user): Show user menu with logout
```

### Files to Modify
1. `src/components/layout/Header.tsx` - Add login/admin links

### Database Setup (One-time)
To assign yourself as admin, run this SQL after registering:
```sql
INSERT INTO user_roles (user_id, role) 
SELECT id, 'admin' FROM profiles WHERE email = 'your-email@example.com';
```

---

## Summary
- Add login/admin button to the website header
- Show admin link only to users with staff/admin roles
- Include user menu with logout option for authenticated users
