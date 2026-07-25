-- Compatibility for dispensary tabs opened before guarded removal shipped.
-- Those clients soft-delete with PATCH ... RETURNING id. PostgreSQL applies
-- SELECT RLS to the returned row after deleted_at is set, so the active-row
-- policy no longer sees it. Let a caller read only rows they removed themself;
-- the existing UPDATE policy still decides whether the removal is authorized.
DROP POLICY IF EXISTS "consultation_items_own_removed_read"
  ON public.consultation_items;
CREATE POLICY "consultation_items_own_removed_read"
  ON public.consultation_items
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND deleted_by = auth.uid()
  );
