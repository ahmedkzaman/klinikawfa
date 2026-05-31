-- FEFO: pick earliest-expiry batch with stock
SELECT id, batch_number, expiry_date, quantity_remaining
FROM public.inventory_item_batches
WHERE inventory_item_id = :item_id
  AND quantity_remaining > 0
ORDER BY expiry_date ASC, created_at ASC
LIMIT 1;
