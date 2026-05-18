DROP POLICY IF EXISTS consultation_items_update_active ON public.consultation_items;

CREATE POLICY consultation_items_update_active ON public.consultation_items
FOR UPDATE
USING (
  deleted_at IS NULL
  AND (
    public.is_ops_or_admin(auth.uid())
    OR public.has_role(auth.uid(), 'locum')
  )
)
WITH CHECK (
  public.is_ops_or_admin(auth.uid())
  OR public.has_role(auth.uid(), 'locum')
);

DROP POLICY IF EXISTS consultation_items_ops_insert ON public.consultation_items;

CREATE POLICY consultation_items_ops_insert ON public.consultation_items
FOR INSERT
WITH CHECK (
  public.is_ops_or_admin(auth.uid())
  OR public.has_role(auth.uid(), 'locum')
);