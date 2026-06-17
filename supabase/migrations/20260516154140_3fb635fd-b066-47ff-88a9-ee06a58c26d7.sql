
CREATE OR REPLACE VIEW public.v_inventory_movement_stats
WITH (security_invoker = on) AS
WITH usage AS (
  SELECT
    inventory_item_id,
    COALESCE(SUM(CASE WHEN created_at >= now() - interval '30 days' THEN -qty_change ELSE 0 END), 0)::numeric AS used_30d,
    COALESCE(SUM(CASE WHEN created_at >= now() - interval '90 days' THEN -qty_change ELSE 0 END), 0)::numeric AS used_90d,
    MAX(created_at) AS last_dispensed_at
  FROM public.inventory_transactions
  WHERE transaction_type = 'dispense'
    AND qty_change < 0
    AND created_at >= now() - interval '90 days'
  GROUP BY inventory_item_id
)
SELECT
  i.id AS item_id,
  i.name,
  COALESCE(i.stock, 0)::numeric                  AS current_stock,
  COALESCE(i.stock_amount_warning, 0)::numeric   AS reorder_level,
  COALESCE(u.used_30d, 0)                        AS used_30d,
  COALESCE(u.used_90d, 0)                        AS used_90d,
  ROUND(COALESCE(u.used_90d, 0) / 90.0, 3)       AS avg_daily_usage,
  CASE
    WHEN COALESCE(u.used_90d, 0) = 0 THEN NULL
    ELSE ROUND(COALESCE(i.stock, 0)::numeric / (u.used_90d / 90.0), 1)
  END AS days_cover,
  CASE
    WHEN COALESCE(u.used_90d, 0) = 0 THEN 'dead'
    WHEN COALESCE(u.used_30d, 0) > 0
         AND (COALESCE(i.stock, 0)::numeric / NULLIF(u.used_90d / 90.0, 0)) < 30 THEN 'fast'
    WHEN (COALESCE(i.stock, 0)::numeric / NULLIF(u.used_90d / 90.0, 0)) > 90 THEN 'slow'
    ELSE 'normal'
  END AS movement_status,
  u.last_dispensed_at
FROM public.inventory_items i
LEFT JOIN usage u ON u.inventory_item_id = i.id
WHERE i.status = 'active';

GRANT SELECT ON public.v_inventory_movement_stats TO authenticated;
