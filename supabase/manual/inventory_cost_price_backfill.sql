-- ============================================================================
-- Inventory cost_price backfill — Klinik Awfa
-- Generated 2026-09-02
--
-- Purpose: 17 active inventory items have cost_price = 0 (or NULL). While
-- cost is missing, the Insight "Doctor performance" COGS / gross profit /
-- margin for any visit that dispenses these items is only PARTIAL (the
-- dispensed quantity is excluded from COGS). Filling the real purchase cost
-- makes those metrics complete.
--
-- HOW TO USE:
--   1. Look up each item's latest supplier purchase price (per unit / per
--      tablet / per piece — the same unit you dispense in).
--   2. Replace the 0.00 placeholder in the matching UPDATE below.
--   3. Run ONLY the lines you have filled in. Do NOT run a line that still
--      has 0.00 — it is a no-op guard, but leaving it out keeps things clean.
--   4. Re-run the report; the amber "partial cost" flag clears once no
--      dispensed item in the period is missing a cost.
--
-- NOTE: cost_price is what the clinic PAYS (purchase cost), NOT the patient
-- price. Every UPDATE is guarded with "AND cost_price IS DISTINCT FROM 0" is
-- intentionally omitted; instead we only update rows that are currently
-- zero/NULL so re-running is safe and never overwrites a real cost.
-- ============================================================================

BEGIN;

-- Each statement only touches rows still missing a cost (idempotent & safe).

-- ECLYPSE SUPER ABSORBENT DRESSING 10CMX10CM
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = '377fd2eb-b96c-4961-a1d2-6f2e9c636970' AND (cost_price IS NULL OR cost_price <= 0);

-- FOLEY CATHETER 12FR
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = 'a4d89a9f-de6b-45fa-bd92-6e1f719181f5' AND (cost_price IS NULL OR cost_price <= 0);

-- FOLEY CATHETER 8FR
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = 'e2139ee1-457e-4bc0-a96c-0ff1ac756921' AND (cost_price IS NULL OR cost_price <= 0);

-- MICROPORE 2.5CM (M)
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = 'a1a79469-a685-4e6a-a247-149d79cf9e7e' AND (cost_price IS NULL OR cost_price <= 0);

-- QV FLARE UP CREAM 100G
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = '0989776b-a2b6-4ae9-b8f3-58183d70f1ed' AND (cost_price IS NULL OR cost_price <= 0);

-- SODIUM CHLORIDE 0.9% W/V INJECTION BP 10ML (INFUSOL NS)
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = '7fabe206-0e28-41cf-b92b-dc6949d774b4' AND (cost_price IS NULL OR cost_price <= 0);

-- SYN-E ELECTROLYTES JUICE 200ML (LIME)
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = 'bf14bcbd-169e-4732-b266-64e45706aa2a' AND (cost_price IS NULL OR cost_price <= 0);

-- T. AMLODIPINE 5MG 10'S AMLIBON
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = 'e6655c18-4c09-4fe9-bb14-6067662adc2d' AND (cost_price IS NULL OR cost_price <= 0);

-- T. EMPAGLIFLOZIN 25MG 10'S JARDIANCE
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = '4d43ced5-2837-44a2-804f-661de06dd22b' AND (cost_price IS NULL OR cost_price <= 0);

-- T. GLICLAZIDE MR 60MG 15'S DIAMICRON MR
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = '9ebc20b3-a1c9-417e-a011-d94e6124bf8e' AND (cost_price IS NULL OR cost_price <= 0);

-- T.ALPRAZOLAM 0.5MG 10'S ASOLAN
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = '06e0f267-451a-415d-a7f9-a5d061554429' AND (cost_price IS NULL OR cost_price <= 0);

-- T.ASPIRIN 100MG 30'S CARDIPRIN
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = 'e76170f5-9912-47f0-9167-880618986cc2' AND (cost_price IS NULL OR cost_price <= 0);

-- T.BISOPROLOL 2.5MG 10'S  CONCOR
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = '67f4f2ab-8da4-4a5f-b23a-78de652bf4b0' AND (cost_price IS NULL OR cost_price <= 0);

-- T.CLOPIDROGEL 75MG 10'S APO
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = 'a968d068-1a82-4b3e-828b-782e5fd38127' AND (cost_price IS NULL OR cost_price <= 0);

-- T.CLOPIDROGEL 75MG 14'S PLAVIX
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = 'f70f82f4-01fd-48a5-89ef-d07a768733a9' AND (cost_price IS NULL OR cost_price <= 0);

-- T.ITOPRIDE HYDROCHLORIDE 50MG 15'S PROGIT
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = 'd5bf37bb-391c-4473-b298-51099267144d' AND (cost_price IS NULL OR cost_price <= 0);

-- WOUND CLOSURE STRIP (NON STERILE) 1'S
UPDATE public.inventory_items SET cost_price = 0.00, updated_at = now()
 WHERE id = '8b784917-f7e9-47f4-951b-4c484b89d985' AND (cost_price IS NULL OR cost_price <= 0);

-- Verification: should return 0 rows once every line above has a real cost.
SELECT id, name, cost_price FROM public.inventory_items
WHERE status = 'active' AND (cost_price IS NULL OR cost_price <= 0)
ORDER BY name;

COMMIT;
