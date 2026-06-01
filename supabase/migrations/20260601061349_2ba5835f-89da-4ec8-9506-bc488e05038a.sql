CREATE OR REPLACE FUNCTION public.admin_reseller_billing_summary()
 RETURNS TABLE(reseller_phone text, reseller_label text, total_links bigint, total_amount bigint, has_pending boolean, pending_bill_id uuid, pending_amount integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_default integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(NULLIF(value,'')::integer, 0) INTO v_default
    FROM public.site_settings WHERE key = 'reseller_price_per_link' LIMIT 1;
  v_default := COALESCE(v_default, 0);

  RETURN QUERY
  WITH base AS (
    SELECT l.reseller_phone AS rphone,
           MAX(l.reseller_label) AS rlabel,
           l.target_id AS tid,
           COUNT(*)::bigint AS copies,
           COALESCE((SELECT p.price_per_link FROM public.reseller_show_prices p WHERE p.show_id = l.target_id), v_default) AS price
    FROM public.reseller_copy_log l
    WHERE l.target_id IS NOT NULL
    GROUP BY l.reseller_phone, l.target_id
  ),
  sums AS (
    SELECT b.rphone,
           MAX(b.rlabel) AS rlabel,
           SUM(b.copies)::bigint AS total_links,
           SUM(b.copies * b.price)::bigint AS total_amount
    FROM base b GROUP BY b.rphone
  )
  SELECT s.rphone, s.rlabel, s.total_links, s.total_amount,
    EXISTS(SELECT 1 FROM public.reseller_bills rb WHERE rb.reseller_phone = s.rphone AND rb.status='pending') AS has_pending,
    (SELECT rb.id FROM public.reseller_bills rb WHERE rb.reseller_phone = s.rphone AND rb.status='pending' ORDER BY rb.created_at DESC LIMIT 1),
    (SELECT rb.amount FROM public.reseller_bills rb WHERE rb.reseller_phone = s.rphone AND rb.status='pending' ORDER BY rb.created_at DESC LIMIT 1)
  FROM sums s
  ORDER BY s.total_amount DESC NULLS LAST;
END; $function$;