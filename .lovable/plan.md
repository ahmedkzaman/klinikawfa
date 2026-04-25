## Phase 2 — Wire `item_code` into Services UI

## Goal
Expose the `item_code` natural key in the Service create/edit dialog so admin edits round-trip the SKU through `useServices` to the database (preventing UPSERT orphans against the legacy import).

## A. `src/hooks/clinic/useServices.ts`

1. **`ServiceInput` interface** — add the optional natural key:
   ```ts
   item_code?: string | null;
   ```
2. **`mapServicePayload`** — append a normalized mapping (trim, empty → `null`):
   ```ts
   if (input.item_code !== undefined) {
     payload.item_code = input.item_code?.toString().trim() || null;
   }
   ```

## B. `src/components/clinic/settings/ServiceDialog.tsx`

1. **`ServiceRow` interface** (line ~48) — add:
   ```ts
   item_code?: string | null;
   ```
2. **`serviceSchema`** (line ~73) — add the field:
   ```ts
   item_code: z.string().trim().max(40).optional().or(z.literal('')),
   ```
3. **`EMPTY` defaults** (line ~84) — add `item_code: ''`.
4. **`reset(...)` hydration** inside the `useEffect` (line ~124) — add:
   ```ts
   item_code: service.item_code ?? '',
   ```
5. **Details `<Card>` UI** (line ~246) — replace the standalone Name field with a 2-column responsive grid containing **Name** + new **Item Code (SKU)**:
   ```tsx
   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
     <div className="space-y-1.5">
       <Label htmlFor="svc-name">Name</Label>
       <Input id="svc-name" placeholder="e.g. Wound Dressing" {...register('name')} />
       {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
     </div>
     <div className="space-y-1.5">
       <Label htmlFor="svc-item-code">Item Code (SKU)</Label>
       <Input id="svc-item-code" placeholder="Optional SKU" {...register('item_code')} />
       {errors.item_code && (
         <p className="text-sm text-destructive">{errors.item_code.message}</p>
       )}
     </div>
   </div>
   ```
6. **`onSubmit` payload** (line ~189) — append `item_code: data.item_code` so it flows into both `addService.mutateAsync` and `updateService.mutateAsync`.

## Out of Scope
- No DB migrations (already applied in Phase 1).
- No changes to `inventory_items` UI (already wired).
- No seeding of the 197 services — that is Phase 3, executed separately.

## Verification
- Open an existing service → Item Code field populates from `service.item_code`.
- Edit, save → payload reaches `mapServicePayload`, persists to `services.item_code`.
- Add a new service with a unique code → row inserts; duplicate code violates the partial unique index (expected).