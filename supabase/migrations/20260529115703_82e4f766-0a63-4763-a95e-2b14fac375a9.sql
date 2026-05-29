-- Revoke broad SELECT and re-grant only non-sensitive columns to anon/authenticated.
REVOKE SELECT ON public.membership_packages FROM anon, authenticated;

GRANT SELECT (
  id, name, description, duration_days, price_idr, price_coins,
  pakasir_amount, quota_total, quota_reserved, max_devices,
  includes_replays, status, sort_order, paused, pause_message,
  created_at, updated_at
) ON public.membership_packages TO anon, authenticated;

-- Admin-only accessor that returns the full row including replay_info.
CREATE OR REPLACE FUNCTION public.admin_get_membership_packages()
RETURNS SETOF public.membership_packages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT * FROM public.membership_packages ORDER BY sort_order, created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_membership_packages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_membership_packages() TO authenticated;