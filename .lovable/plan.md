

## Add collapsible "Applications" section to Staff sidebar

Replicate BioInnoTech's sidebar structure by moving "Leave" out of the Staff section into a new collapsible "Applications" section.

### Changes to `src/components/staff/StaffLayout.tsx`

1. **Add imports**: `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` from radix, and `ChevronDown` icon
2. **Create `applicationsNavItems` array** with Leave (currently the only application feature)
3. **Remove Leave** from `staffNavItems`
4. **Add collapsible Applications section** in `SidebarNav` between Staff and Admin sections, matching BioInnoTech's pattern:
   - Divider
   - Collapsible wrapper with `defaultOpen` based on current route
   - "APPLICATIONS" header as trigger with chevron icon
   - Nav items inside collapsible content

This matches BioInnoTech's layout exactly. Additional application items (like Petty Cash or Appraisal) can be added later.

