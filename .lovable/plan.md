# Reorganize Settings Page into Sections

Refactor `src/pages/clinic/settings/SettingsPage.tsx` so the existing 12 cards are split into three labelled groups, each preceded by a section heading and separated by a horizontal divider. No card is added, removed, or renamed — only the layout changes.

## Proposed grouping

Mapping the user's intended sections to the actual cards in the project:

**General & Access**
- Clinic Profile
- General Preferences
- User Management

**Clinical & Operations**
- Inventory & Services
- Diagnosis Sweeper
- Panels & Insurance
- Drug Label
- Queue & TV

**System & Billing**
- Other Charges
- Document & Print
- Document Templates
- Voided Records

## Implementation

- Extend `SettingsCard` with a `group: 'access' | 'clinical' | 'system'` field.
- Define an ordered `SECTIONS` array: `[{ key, title, description }]` for the three groups.
- After filtering visible cards, render each section as:
  - A heading row (`h2` + small muted description)
  - The existing 3-column responsive grid scoped to that section's cards
  - A `<Separator />` (from `@/components/ui/separator`) between sections (not after the last)
- Skip an entire section if it has zero visible cards (so RBAC-hidden cards don't leave empty headings).
- Keep all existing styling tokens (`pageShell`, `pageInner`, `bento`, hover transitions, icon colors).

## Open question

The user named three sections but the project has 12 cards — I've placed each card in the section that best matches its function. If they want a different mapping (e.g. Drug Label under "System & Billing", or Voided Records under "Clinical"), confirm before I implement.
