-- Global postflight: money conservation + row-count deltas + discovery re-run.
-- Counts and aggregates only.
select
  'ledger_capture' as check,
  (select count(*) from private.remedi_retired_rows where table_name='queue_entries') as qe_images,
  (select count(*) from private.remedi_retired_rows where table_name='consultations') as consult_images,
  (select count(*) from private.remedi_retired_rows where table_name='consultation_items') as item_images,
  (select count(*) from private.remedi_retired_rows where table_name='payments') as payment_images,
  (select count(*) from private.remedi_retired_rows where table_name='panel_claims') as claim_images
union all
select
  'retired_money',
  (select coalesce(sum((row_image->>'amount')::numeric),0) from private.remedi_retired_rows where table_name='payments')::text::numeric as payment_images,
  (select coalesce(sum((row_image->>'amount')::numeric),0) from private.remedi_retired_rows where table_name='panel_claims')::text::numeric as consult_images,
  0, 0, 0
;
