UPDATE public.blocked_ips
   SET is_active = false, unblocked_at = now(), updated_at = now()
 WHERE is_active = true AND auto_blocked = true;

DELETE FROM public.rate_limit_violations
 WHERE created_at < now();