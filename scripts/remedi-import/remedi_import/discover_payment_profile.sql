-- Payment-profile breakdown of live-vs-imported collision pairs. Counts only.
-- User policy: (1) no payment on live side -> attach imported to live;
--              (2) equal amounts (imported total == live total) -> duplicate, retire imported;
--              (3) else classify individually.
with imported as (
    select em.patient_id,
           (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           em.source_attendance_at,
           em.queue_entry_id,
           em.consultation_id
    from private.remedi_encounter_map em
    where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
),
live as (
    select q.patient_id,
           (q.created_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           q.created_at,
           q.id as live_queue_entry_id,
           q.visit_type
    from public.queue_entries q
    where q.visit_type in ('consultation', 'direct_sale')
      and q.patient_id is not null
      and not exists (
            select 1 from private.remedi_encounter_map m
            where m.queue_entry_id = q.id
              and m.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
      )
),
pairs as (
    select i.patient_id, i.visit_day,
           i.consultation_id as imported_consultation_id,
           i.queue_entry_id as imported_queue_entry_id,
           l.live_queue_entry_id,
           abs(extract(epoch from (l.created_at - i.source_attendance_at))) / 60.0 as gap_minutes
    from imported i
    join live l on l.patient_id = i.patient_id and l.visit_day = i.visit_day
),
item_totals as (
    select p.*,
           (select coalesce(sum(ci.price * coalesce(ci.quantity, 1)), 0)
            from public.consultation_items ci
            where ci.consultation_id = p.imported_consultation_id and ci.deleted_at is null) as imported_item_total,
           (select coalesce(sum(ci.price * coalesce(ci.quantity, 1)), 0)
            from public.consultation_items ci
            where ci.consultation_id = c.id and ci.deleted_at is null) as live_item_total
    from pairs p
    left join public.consultations c on c.queue_entry_id = p.live_queue_entry_id
),
pay as (
    select it.*,
           (select count(*) from public.payments pay
             where pay.queue_entry_id = it.imported_queue_entry_id) as imported_payment_count,
           (select coalesce(sum(pay.amount), 0) from public.payments pay
             where pay.queue_entry_id = it.imported_queue_entry_id) as imported_payment_total,
           (select count(*) from public.payments pay
             where pay.queue_entry_id = it.live_queue_entry_id) as live_payment_count,
           (select coalesce(sum(pay.amount), 0) from public.payments pay
             where pay.queue_entry_id = it.live_queue_entry_id) as live_payment_total,
           (select count(*) from public.panel_claims pc
             where pc.queue_entry_id = it.imported_queue_entry_id) as imported_claim_count,
           (select count(*) from public.panel_claims pc
             where pc.queue_entry_id = it.live_queue_entry_id) as live_claim_count
    from item_totals it
)
select
    case
        when live_payment_count = 0 and imported_payment_count = 0 then 'A_no_payments_either_side'
        when live_payment_count = 0 and imported_payment_count > 0 then 'B_no_payment_live__imported_paid'
        when live_payment_count > 0 and imported_payment_count = 0 then 'C_paid_live__imported_unpaid'
        else 'D_paid_both_sides'
    end as payment_bucket,
    case
        when imported_item_total = live_item_total then 'equal_items_total'
        when imported_item_total <> live_item_total then 'diff_items_total'
    end as amount_class,
    count(*) as pairs,
    count(*) filter (where gap_minutes <= 240) as within_240,
    count(*) filter (where gap_minutes > 240) as beyond_240
from pay
group by 1, 2
order by 1, 2;
