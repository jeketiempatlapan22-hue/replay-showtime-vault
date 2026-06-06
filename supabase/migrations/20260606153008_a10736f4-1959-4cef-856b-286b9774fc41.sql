CREATE OR REPLACE FUNCTION public.admin_delete_wa_outbox_for_orders(_order_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _order_ids IS NULL OR array_length(_order_ids,1) IS NULL THEN
    RETURN 0;
  END IF;
  WITH d AS (
    DELETE FROM public.wa_outbox WHERE related_order_id = ANY(_order_ids) RETURNING 1
  ) SELECT COUNT(*) INTO v_n FROM d;
  RETURN COALESCE(v_n,0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_wa_outbox_for_show(_show_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH d AS (
    DELETE FROM public.wa_outbox o
    USING public.orders ord
    WHERE o.related_order_id = ord.id AND ord.show_id = _show_id
    RETURNING 1
  ) SELECT COUNT(*) INTO v_n FROM d;
  RETURN COALESCE(v_n,0);
END;
$$;