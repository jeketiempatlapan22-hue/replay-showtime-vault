REVOKE EXECUTE ON FUNCTION public.prune_old_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_old_logs() TO service_role;