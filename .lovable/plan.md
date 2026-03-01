

# Plan: Replace Logo Across the Site

## Overview

Replace the current text-based "KA" logo with the uploaded Klinik Awfa PNG logo in all relevant locations across the site.

## Locations to Update

| Location | Current | Change |
|----------|---------|--------|
| **Header** (desktop + mobile) | Blue gradient box with "KA" text | PNG logo image |
| **Admin Sidebar** | Text "Admin Panel" | PNG logo + text |
| **Footer** | No logo present | Add PNG logo above contact section |

## Steps

1. **Copy logo to project** - Save `user-uploads://image_6.png` to `src/assets/logo-klinik-awfa.png`

2. **Update Header** (`src/components/layout/Header.tsx`)
   - Replace the "KA" gradient div with an `<img>` tag using the imported logo
   - Size: ~44px height, auto width
   - Keep the hover animation

3. **Update Admin Sidebar** (`src/components/admin/AdminSidebar.tsx`)
   - Add the logo image in the brand header area
   - Show small icon when collapsed, larger logo when expanded

4. **Update Footer** (`src/components/layout/Footer.tsx`)
   - Add a white-filtered version of the logo at the top of the footer content for brand consistency

## Files Modified

- `src/assets/logo-klinik-awfa.png` (new - copied from upload)
- `src/components/layout/Header.tsx`
- `src/components/admin/AdminSidebar.tsx`
- `src/components/layout/Footer.tsx`

