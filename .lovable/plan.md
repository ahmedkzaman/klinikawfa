# Fix Receipt Print Margins

The print currently snaps to the very top-left edge because the hardened `@media print` rule overrides the receipt's own `p-8` padding with `padding: 0 !important`. Result: letterhead and table hug the paper edge.

## Change

**`src/index.css`** — inside the existing `@media print` block:

- Remove `padding: 0 !important` from `.print-container` (and from the Radix dialog override). The `@page { margin: 15mm }` rule already gives the page a printable safe area, and the component's own Tailwind `p-8` provides inner breathing room.
- Keep everything else: `position: absolute; top: 0; left: 0; width: 100%; margin: 0` on `.print-container`, the visibility rules, the dialog transform reset, and `.no-print { display: none }`.

No component changes. No business logic changes.
