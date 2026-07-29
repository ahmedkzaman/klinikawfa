-- Cover the feature-owned foreign keys flagged by the Supabase performance
-- advisor. Queue/consultation/created-at query paths are already covered by
-- the audit table's composite indexes from the base migration.
CREATE INDEX completed_bill_correction_audit_actor_id_idx
  ON public.completed_bill_correction_audit (actor_id);

CREATE INDEX completed_bill_correction_guard_consultation_id_idx
  ON public.completed_bill_correction_guard (consultation_id);

CREATE INDEX completed_bill_correction_guard_actor_id_idx
  ON public.completed_bill_correction_guard (actor_id);
