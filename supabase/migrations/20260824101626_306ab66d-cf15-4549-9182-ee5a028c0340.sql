CREATE OR REPLACE FUNCTION public.admin_sync_package_duration(_package_id uuid, _include_expired boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pkg RECORD;
  _count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO _pkg FROM public.membership_packages WHERE id = _package_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'package_not_found';
  END IF;

  UPDATE public.membership_tokens t
  SET duration_days = _pkg.duration_days,
      max_devices = _pkg.max_devices,
      includes_replays = _pkg.includes_replays,
      starts_at = COALESCE(_pkg.fixed_starts_at, t.starts_at),
      expires_at = COALESCE(
        _pkg.fixed_expires_at,
        COALESCE(_pkg.fixed_starts_at, t.starts_at) + (_pkg.duration_days || ' days')::interval
      ),
      updated_at = now()
  WHERE t.package_id = _package_id
    AND t.revoked = false
    AND (_include_expired OR t.expires_at > now());

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sync_package_duration(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sync_package_duration(uuid, boolean) TO authenticated;