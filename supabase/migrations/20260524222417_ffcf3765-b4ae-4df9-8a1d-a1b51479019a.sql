-- Pause per package + 5min reservation + guest QRIS support + link tokens to packages

ALTER TABLE public.membership_packages 
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pause_message text NOT NULL DEFAULT '';

ALTER TABLE public.membership_tokens
  ADD COLUMN IF NOT EXISTS package_id uuid;

CREATE INDEX IF NOT EXISTS idx_membership_tokens_package_id ON public.membership_tokens(package_id);

ALTER TABLE public.membership_orders 
  ALTER COLUMN reserved_until SET DEFAULT (now() + interval '5 minutes');

-- reserve: nullable user_id when QRIS (guest), 5 min hold
CREATE OR REPLACE FUNCTION public.reserve_membership_slot(_package_id uuid, _user_id uuid, _email text, _phone text, _kind text)
RETURNS TABLE(order_id uuid, amount integer, coin_amount integer, reserved_until timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg public.membership_packages%ROWTYPE;
  v_amount integer := 0;
  v_coin integer := 0;
  v_order_id uuid;
  v_reserved_until timestamptz := now() + interval '5 minutes';
BEGIN
  IF _kind NOT IN ('qris','coins') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF _kind = 'coins' AND _user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _email IS NULL OR length(trim(_email)) < 3 THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF _phone IS NULL OR _phone !~ '^62[0-9]{8,13}$' THEN RAISE EXCEPTION 'invalid_phone'; END IF;

  SELECT * INTO v_pkg FROM public.membership_packages WHERE id = _package_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found'; END IF;
  IF v_pkg.status <> 'open' THEN RAISE EXCEPTION 'package_closed'; END IF;
  IF v_pkg.quota_reserved >= v_pkg.quota_total THEN RAISE EXCEPTION 'sold_out'; END IF;

  IF _kind = 'qris' THEN
    v_amount := COALESCE(NULLIF(v_pkg.pakasir_amount,0), v_pkg.price_idr);
    IF v_amount < 100 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  ELSE
    v_coin := v_pkg.price_coins;
    IF v_coin <= 0 THEN RAISE EXCEPTION 'invalid_coin_price'; END IF;
  END IF;

  UPDATE public.membership_packages
    SET quota_reserved = quota_reserved + 1, updated_at = now()
    WHERE id = _package_id;

  INSERT INTO public.membership_orders(package_id, user_id, email, phone, kind, amount, coin_amount, status, reserved_until)
    VALUES (_package_id, _user_id, trim(_email), _phone, _kind, v_amount, v_coin, 'reserved', v_reserved_until)
    RETURNING id INTO v_order_id;

  RETURN QUERY SELECT v_order_id, v_amount, v_coin, v_reserved_until;
END;
$function$;

-- finalize: also save package_id into token
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
  v_expires := now() + make_interval(days => v_pkg.duration_days);

  INSERT INTO public.membership_tokens(
    token, password, label, phone, duration_days, starts_at, expires_at,
    includes_replays, max_devices, created_by, package_id
  ) VALUES (
    v_token, v_password, 'pkg:' || v_pkg.name, v_order.phone,
    v_pkg.duration_days, now(), v_expires,
    v_pkg.includes_replays, v_pkg.max_devices, 'purchase', v_pkg.id
  ) RETURNING id INTO v_token_id;

  UPDATE public.membership_orders
    SET status = 'paid', paid_at = COALESCE(paid_at, now()), membership_token_id = v_token_id, updated_at = now()
    WHERE id = _order_id;

  token := v_token; password := v_password; expires_at := v_expires;
  max_devices := v_pkg.max_devices; includes_replays := v_pkg.includes_replays;
  replay_info := v_pkg.replay_info; package_name := v_pkg.name; duration_days := v_pkg.duration_days;
  RETURN NEXT;
END;
$function$;

-- Backfill existing tokens
UPDATE public.membership_tokens mt
SET package_id = mo.package_id
FROM public.membership_orders mo
WHERE mo.membership_token_id = mt.id
  AND mt.package_id IS NULL;