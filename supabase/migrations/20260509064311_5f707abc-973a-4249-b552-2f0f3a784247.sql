CREATE OR REPLACE FUNCTION public.admin_clear_live_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH d AS (DELETE FROM public.live_messages WHERE id IS NOT NULL RETURNING 1)
  SELECT count(*) INTO v_count FROM d;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_clear_live_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.live_messages WHERE id IS NOT NULL;
$$;