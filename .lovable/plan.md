## Seven Updates: UI Papercuts + TV Preview & Volume Control

### 1. Edit Rooms — `src/pages/clinic/settings/QueueSettings.tsx`
- Add inline rename row state: `editingRoomId`, `editingLabel`.
- When Pencil icon clicked: swap label `<span>` for `<Input>` + Save (Check) + Cancel (X) buttons.
- Save button **disabled** when `editingLabel.trim().length === 0`.
- Save calls `useUpdateRoom().mutateAsync({ id, label: editingLabel.trim() })` → toast → clear edit state.
- No delete (FK constraint).

### 2. Treatment Plan Search — `src/pages/clinic/ConsultationDetail.tsx` (~line 439-441)
Replace filter with safe coercion:
```ts
const q = treatmentSearch.toLowerCase();
list = list.filter((i) => String(i.item_name ?? '').toLowerCase().includes(q));
```
Do NOT trim the search term itself, so `"t."` and 1-char inputs work.

### 3. Past Visits Price Alignment
**`src/pages/clinic/ConsultationDetail.tsx` (~line 977-986):**
```tsx
<div className="flex justify-between items-start gap-4 w-full pl-2">
  <div className="flex-1 min-w-0 flex flex-col">
    <span className="text-sm text-slate-600 break-words">
      {it.item_name} x{it.quantity} {it.dosage && `(${it.dosage})`}
    </span>
  </div>
  <span className="shrink-0 text-right whitespace-nowrap text-sm text-slate-600">
    RM {Number(it.price).toFixed(2)}
  </span>
</div>
```
**`src/components/patients/PatientProfileSheet.tsx` `VisitRow` (~line 234-261):** Replace the `<table>` with a flex-based row list using the same container/left/right classes so long item names wrap and prices stay right-aligned.

### 4. Price Tier Default — `src/components/clinic/consultation/TreatmentItemCard.tsx`
- Add prop `isPanel?: boolean`.
- Initialize: `useState(item.price_tier ?? (isPanel ? 'PANEL' : 'SELF PAY'))`.
- Mark the `<Select>` **`disabled`** (read-only) — the DB trigger forces the correct price.
- In `ConsultationDetail.tsx`:
  - Compute `const isPanel = !!entry?.panel_id || (entry?.payment_method ?? '').startsWith('panel');`
  - Update `PRICE_TIERS = ['SELF PAY', 'PANEL']` so both render.
  - Pass `isPanel={isPanel}` into `<TreatmentItemCard />`.

### 5. TV Preview Route Logic — `src/pages/tv/QueueTV.tsx`
- At top: `const isPreview = new URLSearchParams(window.location.search).get('preview') === 'true';`
- If `isPreview`:
  - Initialize `started = true` (skip gate screen).
  - Skip `playDingDong()` and the warm-up `speechSynthesis.speak(' ')`.
  - In `processQueue` / `speakMalay`, early-return when `isPreview` is true.
  - Force the video player muted (see Task 6).

### 6. TV Volume Control & Player Swap — `src/pages/tv/QueueTV.tsx`
- Add dependency: `react-player` (via bun add).
- State: `const [videoVolume, setVideoVolume] = useState(0.5);`
- Replace `<iframe>` with:
  ```tsx
  <ReactPlayer
    url={`https://www.youtube.com/watch?v=${ytId}`}
    playing
    loop
    muted={isPreview}
    volume={videoVolume}
    width="100%"
    height="100%"
    controls={false}
  />
  ```
- Wrap the video pane container as `relative` and overlay a Shadcn `<Slider>` in the bottom-left:
  ```tsx
  <div className="absolute bottom-4 left-4 w-48 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-2">
    <Volume2 className="h-4 w-4 text-white/80" />
    <Slider value={[videoVolume]} max={1} step={0.05} onValueChange={(v) => setVideoVolume(v[0])} />
  </div>
  ```
- Hide the slider when `isPreview` (no-op control in preview).

### 7. TV Live Preview — `src/pages/clinic/settings/QueueSettings.tsx`
At the bottom of the TV card (after the `/tv` link block) add:
```tsx
<div className="space-y-2">
  <Label>Live Preview</Label>
  <iframe
    src="/tv?preview=true"
    title="TV Preview"
    className="w-full aspect-video rounded-xl border-4 border-slate-800 pointer-events-none"
  />
</div>
```

### Out of Scope
- No DB/schema changes.
- No hard-delete on rooms (FK to `queue_entries.assigned_room_id`).
- Voice synthesis triggering rules unchanged (only suppressed in preview).
