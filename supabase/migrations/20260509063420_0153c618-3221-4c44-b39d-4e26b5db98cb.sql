
-- Admin-only RPC to clear all live chat messages
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
  WITH d AS (DELETE FROM public.live_messages RETURNING 1)
  SELECT count(*) INTO v_count FROM d;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_live_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_live_messages() TO authenticated;

-- Internal function used by cron to wipe all live chat messages
CREATE OR REPLACE FUNCTION public.cron_clear_live_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.live_messages;
$$;

REVOKE ALL ON FUNCTION public.cron_clear_live_messages() FROM PUBLIC;

-- Schedule daily reset at 00:00 Asia/Jakarta (17:00 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('clear-live-messages-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clear-live-messages-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'clear-live-messages-daily',
  '0 17 * * *',
  $$ SELECT public.cron_clear_live_messages(); $$
);
