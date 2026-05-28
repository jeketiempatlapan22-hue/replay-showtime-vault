UPDATE public.membership_orders mo
SET wa_sent_at = wo.sent_at,
    wa_attempts = GREATEST(COALESCE(mo.wa_attempts, 0), 1)
FROM (
  SELECT related_order_id, MIN(created_at) AS sent_at
  FROM public.wa_outbox
  WHERE status = 'sent' AND related_order_id IS NOT NULL
  GROUP BY related_order_id
) wo
WHERE mo.id = wo.related_order_id
  AND mo.status = 'paid'
  AND mo.wa_sent_at IS NULL;