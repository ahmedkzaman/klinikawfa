-- Remedi duplicate-visit discovery — counts-only output.
-- Join imported encounters (private.remedi_encounter_map, batch f894b0ca) to live
-- (unmapped) queue entries for the same patient and same KL-local day.
-- Outputs bucket counts, gap statistics, and affected-day histogram only.
with bounds as (
    select min((em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date) as min_day,
           max((em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date) as max_day
    from private.remedi_encounter_map em
    where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
),
imported as (
    select em.patient_id,
           (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           em.source_attendance_at,
           em.queue_entry_id,
           em.consultation_id,
           em.source_doctor_names
    from private.remedi_encounter_map em
    cross join bounds b
    where em.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
      and (em.source_attendance_at at time zone 'Asia/Kuala_Lumpur')::date between b.min_day and b.max_day
),
live as (
    select q.patient_id,
           (q.created_at at time zone 'Asia/Kuala_Lumpur')::date as visit_day,
           q.created_at,
           q.id as queue_entry_id,
           q.visit_type
    from public.queue_entries q
    where q.visit_type in ('consultation', 'direct_sale')
      and q.patient_id is not null
      and not exists (
            select 1
            from private.remedi_encounter_map m
            where m.queue_entry_id = q.id
              and m.batch_id = 'f894b0ca-d3a2-5406-ac1f-9277a34b509d'
      )
),
pairs as (
    select i.patient_id,
           i.visit_day,
           i.queue_entry_id as imported_queue_entry_id,
           i.consultation_id as imported_consultation_id,
           i.source_attendance_at,
           i.source_doctor_names,
           l.queue_entry_id as live_queue_entry_id,
           l.created_at as live_created_at,
           l.visit_type as live_visit_type,
           abs(extract(epoch from (l.created_at - i.source_attendance_at))) / 60.0 as gap_minutes
    from imported i
    join live l
      on l.patient_id = i.patient_id
     and l.visit_day = i.visit_day
),
pair_money as (
    select p.*,
           (select coalesce(sum(ci.price * coalesce(ci.quantity, 1)), 0)
            from public.consultation_items ci
            where ci.consultation_id = p.imported_consultation_id
              and ci.deleted_at is null) as imported_item_total,
           (select coalesce(sum(ci.price * coalesce(ci.quantity, 1)), 0)
            from public.consultation_items ci
            where ci.consultation_id = c_live.id
              and ci.deleted_at is null) as live_item_total,
           c_live.id as live_consultation_id
    from pairs p
    join public.consultations c_imp on c_imp.id = p.imported_consultation_id
    left join public.consultations c_live on c_live.queue_entry_id = p.live_queue_entry_id
),
classified as (
    select pm.*,
           case
               when pm.live_item_total is not null and pm.imported_item_total = pm.live_item_total
                   then 'equal_amount'
               when pm.imported_item_total = 0 then 'imported_zero_items'
               else 'amount_mismatch'
           end as amount_class,
           case
               when exists (
                   select 1
                   from unnest(pm.source_doctor_names) d
                   where pm.live_consultation_id is not null
                     and exists (
                         select 1
                         from public.consultation_items ci
                         where ci.consultation_id = pm.live_consultation_id
                           and ci.item_name ilike ('%' || d || '%')
                     )
               ) then 'doctor_match'
               else 'no_doctor_match'
           end as doctor_class
    from pair_money pm
)
select 'pair_count' as metric, count(*)::text as value from classified
union all
select 'by_live_visit_type_' || live_visit_type, count(*)::text from classified group by live_visit_type
union all
select 'amount_class_' || amount_class, count(*)::text from classified group by amount_class
union all
select 'gap_le_30min', count(*)::text from classified where gap_minutes <= 30
union all
select 'gap_31_120min', count(*)::text from classified where gap_minutes > 30 and gap_minutes <= 120
union all
select 'gap_121_240min', count(*)::text from classified where gap_minutes > 120 and gap_minutes <= 240
union all
select 'gap_gt_240min', count(*)::text from classified where gap_minutes > 240
union all
select 'gap_min_minutes', round(min(gap_minutes)::numeric, 1)::text from classified
union all
select 'gap_median_minutes', round(percentile_cont(0.5) within group (order by gap_minutes)::numeric, 1)::text from classified
union all
select 'gap_max_minutes', round(max(gap_minutes)::numeric, 1)::text from classified
union all
select 'affected_days', count(distinct (patient_id, visit_day))::text from classified
union all
select 'affected_months', count(distinct to_char(visit_day, 'YYYY-MM'))::text from classified
union all
select 'pairs_with_money_on_both_sides', count(*)::text from classified
    where imported_item_total > 0 and live_item_total > 0
union all
select 'pairs_money_imported_only', count(*)::text from classified
    where imported_item_total > 0 and (live_item_total = 0 or live_item_total is null)
union all
select 'pairs_money_live_only', count(*)::text from classified
    where imported_item_total = 0 and live_item_total > 0
order by metric;
