REVOKE ALL ON FUNCTION public.sync_show_bundle() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.trg_sync_show_bundle() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.gen_bundle_password() FROM anon, authenticated, public;

ALTER FUNCTION public.get_show_bundle() SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.admin_get_show_bundle() FROM anon, public;
REVOKE ALL ON FUNCTION public.admin_set_bundle_show(uuid, boolean) FROM anon, public;
REVOKE ALL ON FUNCTION public.admin_set_bundle_active(boolean) FROM anon, public;
REVOKE ALL ON FUNCTION public.admin_rotate_bundle_password() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_get_show_bundle() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_bundle_show(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_bundle_active(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rotate_bundle_password() TO authenticated;