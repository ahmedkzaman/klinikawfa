-- Stock planning: make every low-stock item orderable.
--
-- Problem 1: items at/below reorder level with no usage in the last 90 days
-- (dead/slow consumables, new items, seasonal items) got suggested_qty = NULL,
-- so their "Create order" button was permanently disabled with no alternative.
-- Fallback: when usage data is absent but the item is at/below its reorder
-- level, suggest topping up to the reorder level (minus open orders). Items
-- with no reorder level set stay NULL — there is no defensible quantity to
-- invent.
--
-- Problem 2: healthy items with ample stock computed suggested_qty = 0 and the
-- UI enabled "Create order" for an order of zero. suggested_qty = 0 is now an
-- explicit "nothing needed" state; the UI treats it like NULL (disabled
-- button). No view change is needed for that — 0 was already the value.

create or replace view public.v_procurement_stock_planning
with (security_invoker = true) as
select
  m.item_id,
  m.name,
  i.category,
  m.current_stock,
  m.reorder_level,
  m.used_30d,
  m.avg_daily_usage,
  m.days_cover,
  m.movement_status,
  coalesce(o.open_order_qty, 0) as open_order_qty,
  coalesce(ls.lead_time_days, 7) as supplier_lead_time_days,
  coalesce(b.nearest_expiry_date, i.nearest_expiry_date) as nearest_expiry_date,
  case
    when m.avg_daily_usage > 0 then
      greatest(
        ceil(m.avg_daily_usage * (coalesce(ls.lead_time_days, 7) + 7))  -- 7 = urgent days buffer
        - m.current_stock
        - coalesce(o.open_order_qty, 0),
        0
      )::integer
    -- No measurable usage: fall back to a reorder-level top-up so low-stock
    -- items remain orderable, but only when a reorder level actually exists.
    when coalesce(m.reorder_level, 0) > m.current_stock then
      greatest(m.reorder_level - m.current_stock - coalesce(o.open_order_qty, 0), 0)::integer
    else null
  end as suggested_qty,
  case
    when m.avg_daily_usage > 0 then 'Based on 90-day usage, lead time, and open orders'
    when coalesce(m.reorder_level, 0) > m.current_stock
      then 'No recent usage; tops up to reorder level'
    when m.current_stock <= m.reorder_level then 'Low stock'
    else 'Insufficient usage data'
  end as recommendation_reason
from public.v_inventory_movement_stats m
join public.inventory_items i on i.id = m.item_id
left join lateral (
  select s2.lead_time_days
  from public.purchase_order_items it2
  join public.purchase_orders po2 on po2.id = it2.po_id
  join public.suppliers s2 on s2.id = po2.supplier_id
  where it2.inventory_item_id = m.item_id
  order by po2.created_at desc
  limit 1
) ls on true
left join (
  select it.inventory_item_id, sum(it.order_qty - it.received_qty) as open_order_qty
  from public.purchase_order_items it
  join public.purchase_orders po on po.id = it.po_id
  where po.status in ('Awaiting approval','Ordered')
  group by it.inventory_item_id
) o on o.inventory_item_id = m.item_id
left join (
  select inventory_item_id, min(expiry_date) as nearest_expiry_date
  from public.inventory_item_batches
  where quantity_remaining > 0
  group by inventory_item_id
) b on b.inventory_item_id = m.item_id;
