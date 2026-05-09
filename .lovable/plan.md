# Sprint 1 — Core Shell

Presentation-only update to `src/components/staff/StaffLayout.tsx`. No routing, logic, or guard changes. All `dark:` variants removed from this file.

## Changes to `StaffLayout.tsx`

### Outer canvas
- Root wrapper: `bg-background` → `bg-slate-50`.
- Loader / "Important Notice" gate screens: `bg-background` → `bg-slate-50`. Notice card becomes a white rounded-2xl bento card (`bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-6`) with blue-600 acknowledge button.
- Main scroll column: `bg-slate-50`. Drop the `container` class on `<main>` so each page can apply its own `pageShell` / `pageInner` later. Replace with simple `flex-1` + light padding fallback.

### Desktop + Mobile sidebar
- Surface: `bg-white border-r border-slate-100` (no shadow).
- Logo header: `border-b border-slate-100`; brand text `text-slate-800`.
- "Open Clinic System" CTA: `rounded-xl bg-blue-600 hover:bg-blue-700 text-white`.
- Section labels (Staff / Applications / Admin / Website): `text-xs font-bold text-slate-500 uppercase tracking-wider`.
- Group dividers: `border-slate-100`.
- Idle nav links: `text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-xl`.
- Active nav links: `bg-blue-50 text-blue-700 font-medium rounded-xl` (replaces `bg-primary/10 text-primary`).
- Inbox unread pill: `bg-rose-500 text-white`.
- Footer (sign-out): `border-t border-slate-100`, email `text-slate-500`, sign-out button `text-slate-600 hover:bg-slate-50`.

### Top header bar
- `bg-white/90 backdrop-blur border-b border-slate-100`.
- Email text: `text-slate-500`.
- Mobile menu trigger: `text-slate-600 hover:bg-slate-50`.

## Out of scope for this sprint
- Inner page contents (Dashboard, Punch, etc.) — handled in Sprint 2+.
- `bentoTokens.ts` itself — reused as-is, not modified.
- Auth, onboarding, circular-notice gating logic — untouched.

## Verification
Open `/staff/dashboard` after the change: white sidebar with blue-50 active pill, slate-50 page canvas, white frosted top header. No dark seams remain in the shell.
