## Treatment Picker — global search + tabbed mapping

Two surfaces, same mental model. Both get **case-insensitive global search across `name` + `generic_name`** and **tabs that filter by mapped category**, with **search overriding tabs** when active.

### A. `AddTreatmentBulkDialog.tsx` (the picker — currently no tabs, single combined table)

1. **Global search upgrade** (existing `filtered` memo)
   - Match against `name`, `generic_name` (inventory items only — services/packages don't have it), and `group` label.
   - Already case-insensitive via `toLowerCase`. Just widen the field set; today only `name` + `group` are checked. *(`sku` does not exist on `inventory_items`, skipping.)*

2. **Add tab strip** above the table — pill buttons in the existing dialog style:
   - `All` · `Medicine` · `Procedures` · `Packages`
   - State: `const [tab, setTab] = useState<'all'|'medicine'|'procedure'|'package'>('all')`.
   - Counts shown in pill labels (mirror Treatment Plan tabs in `ConsultationDetail`).

3. **Mapping rule** — applied to the combined `allItems` rows when computing `filtered`:
   - **Medicine** → `row.type === 'item'` AND inventory `category?.toLowerCase() === 'medication'`.
   - **Procedures** → `row.type === 'service'` (per your decision: procedures live in `services`). Plus inventory rows whose `name` matches `/fee|procedure|service/i` as a fallback so legacy fee items still appear.
   - **Packages** → `row.type === 'package'`.
   - **All** → no filter.

4. **Search overrides tab** — if `search.trim()` is non-empty, ignore the tab filter and search the entire combined list. Tab filter only applies when search is empty (matches your "Global Search wins" rule).

5. **Null-safe category** — coerce `category ?? ''` and lowercase before comparing to avoid runtime errors on partial inventory rows.

### B. `ConsultationDetail.tsx` Treatment Plan tabs (lines ~844–867)

1. **Rename** keys/labels to the new mapping vocabulary:
   - `all` · `medicine` · `procedure` · `package` (was `all/item/service/package`).
2. **Update `itemCounts` and `filteredTreatmentItems` memos** to use the same mapping rule as the picker:
   - `medicine` ⇢ items whose underlying inventory category (case-insensitive) is `medication`.
   - `procedure` ⇢ items of type `service`, plus item-typed rows whose `item_name` matches `/fee|procedure|service/i`.
   - `package` ⇢ type `package`.
3. **Case-insensitive everywhere** — wherever a string compare touches `category` or a UI tag, use `value?.toLowerCase()`.

### Data fetching — no change needed

- `useInventoryItems` already returns all rows regardless of category. No null filtering happens upstream. Confirmed by the picker showing both `Medication` and `Disposable Item` rows in one table today.
- DB only has `Medication` and `Disposable Item` as inventory categories (verified). No schema change. The "procedure" tab pulls from the existing `services` table, matching your answer.

### Out of scope

- No DB migrations. No new `Procedure` enum. Mapping is pure UI.
- No changes to dispense/checkout pickers. Only the consultation-side picker and Treatment Plan list.

### Files touched

- `src/components/clinic/consultation/AddTreatmentBulkDialog.tsx` — extend search fields, add tab state + pill UI + count badges, mapping-aware `filtered` memo, search-overrides-tab branch.
- `src/pages/clinic/ConsultationDetail.tsx` — relabel tabs, replace `itemCounts` / `filteredTreatmentItems` logic with the shared mapping rule.