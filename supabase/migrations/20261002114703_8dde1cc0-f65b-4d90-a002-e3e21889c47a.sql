CREATE OR REPLACE FUNCTION public.admin_sync_package_duration(_package_id uuid, _include_expired boolean DEFAULT false)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _pkg RECORD; _count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO _pkg FROM public.membership_packages WHERE id = _package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found'; END IF;

  WITH calc AS (
    SELECT t.id,
      CASE WHEN _pkg.fixed_starts_at IS NOT NULL THEN LEAST(_pkg.fixed_starts_at, now()) ELSE LEAST(t.starts_at, now()) END AS ns
    FROM public.membership_tokens t
    WHERE t.package_id = _package_id AND t.revoked = false
  ), calc2 AS (
    SELECT id, ns, COALESCE(_pkg.fixed_expires_at, ns + (_pkg.duration_days || ' days')::interval) AS ne FROM calc
  )
  UPDATE public.membership_tokens t
  SET duration_days = _pkg.duration_days, max_devices = _pkg.max_devices, includes_replays = _pkg.includes_replays,
      starts_at = c.ns, expires_at = c.ne, updated_at = now()
  FROM calc2 c
  WHERE t.id = c.id AND (_include_expired OR c.ne > now());

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$function$;