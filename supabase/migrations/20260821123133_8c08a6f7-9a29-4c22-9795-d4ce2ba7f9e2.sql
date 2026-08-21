CREATE OR REPLACE FUNCTION public.prune_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.bot_inbox_events WHERE created_at < now() - interval '7 days';
  DELETE FROM public.bot_inbox_dedup WHERE received_at < now() - interval '1 day';
  DELETE FROM public.wa_outbox WHERE created_at < now() - interval '14 days';
  DELETE FROM public.wa_send_claims WHERE claimed_at < now() - interval '2 days';
  DELETE FROM public.ip_visit_log WHERE last_seen_at < now() - interval '7 days';
  DELETE FROM public.rate_limit_violations WHERE created_at < now() - interval '7 days';
  DELETE FROM public.login_attempts WHERE attempted_at < now() - interval '7 days';
  DELETE FROM public.reseller_copy_log WHERE created_at < now() - interval '30 days';
  DELETE FROM public.admin_action_logs WHERE created_at < now() - interval '90 days';
  DELETE FROM public.token_deliveries WHERE sent_at < now() - interval '60 days';
END;
$$;

SELECT public.prune_old_logs();

SELECT cron.schedule('prune-old-logs-daily', '0 3 * * *', $$select public.prune_old_logs();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-old-logs-daily');