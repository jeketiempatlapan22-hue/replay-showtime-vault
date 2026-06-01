
ALTER TABLE public.membership_packages
  ADD COLUMN IF NOT EXISTS fixed_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS fixed_expires_at timestamptz;

GRANT SELECT (fixed_starts_at, fixed_expires_at) ON public.membership_packages TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalize_membership_order(_order_id uuid)
RETURNS TABLE(token text, password text, expires_at timestamp with time zone, max_devices integer, includes_replays boolean, replay_info text, package_name text, duration_days integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.membership_orders%ROWTYPE;
  v_pkg public.membership_packages%ROWTYPE;
  v_token text;
  v_password text;
  v_expires timestamptz;
  v_starts timestamptz;
  v_duration integer;
  v_token_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.membership_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_order.status = 'paid' AND v_order.membership_token_id IS NOT NULL THEN
    SELECT mt.token, mt.password, mt.expires_at, mt.max_devices, mt.includes_replays
      FROM public.membership_tokens mt WHERE mt.id = v_order.membership_token_id
      INTO v_token, v_password, v_expires, max_devices, includes_replays;
    SELECT name, duration_days, replay_info INTO package_name, duration_days, replay_info
      FROM public.membership_packages WHERE id = v_order.package_id;
    token := v_token; password := v_password; expires_at := v_expires;
    RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_pkg FROM public.membership_packages WHERE id = v_order.package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found'; END IF;

  v_token := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_password := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  -- Fixed window has priority: every buyer of this package shares the same end date.
  IF v_pkg.fixed_expires_at IS NOT NULL THEN
    v_starts := COALESCE(v_pkg.fixed_starts_at, now());
    v_expires := v_pkg.fixed_expires_at;
    v_duration := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_expires - v_starts)) / 86400.0)::int);
  ELSE
    v_starts := now();
    v_expires := v_starts + make_interval(days => v_pkg.duration_days);
    v_duration := v_pkg.duration_days;
  END IF;

  INSERT INTO public.membership_tokens(
    token, password, label, phone, duration_days, starts_at, expires_at,
    includes_replays, max_devices, created_by, package_id
  ) VALUES (
    v_token, v_password, 'pkg:' || v_pkg.name, v_order.phone,
    v_duration, v_starts, v_expires,
    v_pkg.includes_replays, v_pkg.max_devices, 'purchase', v_pkg.id
  ) RETURNING id INTO v_token_id;

  UPDATE public.membership_orders
    SET status = 'paid', paid_at = COALESCE(paid_at, now()), membership_token_id = v_token_id, updated_at = now()
    WHERE id = _order_id;

  token := v_token; password := v_password; expires_at := v_expires;
  max_devices := v_pkg.max_devices; includes_replays := v_pkg.includes_replays;
  replay_info := v_pkg.replay_info; package_name := v_pkg.name; duration_days := v_duration;
  RETURN NEXT;
END;
$function$;
