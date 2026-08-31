-- Expose archived_at on the safe views so client-side archive filters work.
-- services_safe / packages_safe previously omitted archived_at, so the
-- "&& !s.archived_at" checks in CatalogItemPicker / AddTreatmentBulkDialog
-- were no-ops for these sources.
CREATE OR REPLACE VIEW public.services_safe AS
SELECT id, name, type, description, price_to_patient, status, category, item_code, archived_at, created_at
FROM public.services;

CREATE OR REPLACE VIEW public.packages_safe AS
SELECT id, name, stock, price, items, status, archived_at, created_at
FROM public.packages;

GRANT SELECT ON public.services_safe TO authenticated;
GRANT SELECT ON public.packages_safe TO authenticated;
