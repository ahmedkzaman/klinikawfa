## Goal
Upgrade `src/components/clinic/settings/DocumentTemplateBuilder.tsx` to expose document-level settings (name, type, paper size, orientation) that dynamically drive the live A4/A5/A6 paper preview, and add a placeholder Save button.

## Changes (single file: DocumentTemplateBuilder.tsx)

### 1. State model
Replace `paperSize` with a single settings object:
```ts
type PaperSize = 'A4' | 'A5' | 'A6';
type Orientation = 'portrait' | 'landscape';
type DocType = 'memo' | 'referral' | 'prescription' | 'mc' | 'quarantine';

const [settings, setSettings] = useState({
  name: 'New Template',
  type: 'memo' as DocType,
  paperSize: 'A4' as PaperSize,
  orientation: 'portrait' as Orientation,
});
```
Helper `updateSetting(key, value)` for clean handlers.

### 2. Top bar
Add a sticky header row with template name on the left and a **Save Template** button on the right that `console.log(settings, content)` for now.

### 3. Document Settings panel (left column, above tag toolbox)
A compact card with:
- **Template Name** — `Input`
- **Document Type** — shadcn `Select` (Memo, Referral Letter, Prescription Slip, Medical Certificate, Quarantine Notice)
- **Paper Size** — `ToggleGroup` (A4 / A5 / A6)
- **Orientation** — `ToggleGroup` (Portrait / Landscape)

Left column gets `overflow-y-auto` on its content region so settings + tags + editor stay usable when stacked.

### 4. Dynamic preview engine (right column)
Replace the hardcoded width/aspect-ratio with a derived dimension table:

```text
A4: 210 x 297 mm
A5: 148 x 210 mm
A6: 105 x 148 mm
```

```ts
const PAPER_DIMS: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
};
const base = PAPER_DIMS[settings.paperSize];
const isLandscape = settings.orientation === 'landscape';
const finalW = isLandscape ? base.h : base.w;
const finalH = isLandscape ? base.w : base.h;
const padding = settings.paperSize === 'A6' ? '15mm' : '25mm';
```

Apply via inline style:
```ts
style={{
  width: '100%',
  maxWidth: `${finalW}mm`,
  aspectRatio: `${finalW} / ${finalH}`,
  padding,
}}
```
Add a `transition-all` for a smooth flip when toggling orientation/size.

### 5. Preserve existing behavior
- Tag toolbox, cursor-aware insertion, `PREVIEW_DICTIONARY` substitution, and highlighted preview HTML stay untouched.
- No DB / persistence work in this pass (Save is a stub).

## Out of scope
- Persisting templates to Supabase
- Rich text editing
- Per-document-type starter content (can be added later by keying off `settings.type`)
