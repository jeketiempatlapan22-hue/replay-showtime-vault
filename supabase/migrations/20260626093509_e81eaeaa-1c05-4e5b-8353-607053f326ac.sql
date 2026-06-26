
CREATE OR REPLACE FUNCTION public.admin_create_membership_user(
  _email text,
  _phone text,
  _package_id uuid,
  _days integer,
  _max_devices integer DEFAULT NULL,
  _includes_replays boolean DEFAULT NULL,
  _replay_info text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pkg record;
  v_token text;
  v_password text;
  v_token_id uuid;
  v_order_id uuid;
  v_expires timestamptz;
  v_max int;
  v_inc boolean;
  v_replay text;
  v_phone text;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _email IS NULL OR length(trim(_email)) < 3 THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF _phone IS NULL OR length(regexp_replace(_phone, '\D', '', 'g')) < 8 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 3650 THEN RAISE EXCEPTION 'invalid_days'; END IF;

  SELECT * INTO v_pkg FROM public.membership_packages WHERE id = _package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found'; END IF;

  v_max := COALESCE(_max_devices, v_pkg.max_devices, 1);
  v_inc := COALESCE(_includes_replays, v_pkg.includes_replays, true);
  v_replay := COALESCE(_replay_info, v_pkg.replay_info, '');
  v_phone := regexp_replace(_phone, '\D', '', 'g');
  IF v_phone LIKE '0%' THEN v_phone := '62' || substring(v_phone from 2); END IF;
  IF v_phone LIKE '8%' THEN v_phone := '62' || v_phone; END IF;

  -- unique token / password
  LOOP
    v_token := upper(substring(encode(gen_random_bytes(12), 'hex') from 1 for 12));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.membership_tokens WHERE token = v_token);
  END LOOP;
  v_password := upper(substring(encode(gen_random_bytes(8), 'hex') from 1 for 8));
  v_expires := now() + (_days || ' days')::interval;

  INSERT INTO public.membership_tokens (
    token, password, label, phone, duration_days, starts_at, expires_at,
    max_devices, includes_replays, replay_info, package_id, created_by
  ) VALUES (
    v_token, v_password,
    'admin-manual:' || v_pkg.name,
    v_phone, _days, now(), v_expires,
    v_max, v_inc, v_replay, v_pkg.id,
    'admin:' || COALESCE((SELECT email FROM auth.users WHERE id = v_uid), v_uid::text)
  ) RETURNING id INTO v_token_id;

  INSERT INTO public.membership_orders (
    package_id, user_id, email, phone, kind, amount, coin_amount,
    status, membership_token_id, paid_at, reserved_until, wa_sent_at
  ) VALUES (
    v_pkg.id, NULL, lower(trim(_email)), v_phone, 'qris', 0, 0,
    'paid', v_token_id, now(), now(), NULL
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.admin_action_logs (actor_user_id, actor_email, action, filter, order_ids, affected_count, details)
  VALUES (
    v_uid,
    COALESCE((SELECT email FROM auth.users WHERE id = v_uid), ''),
    'admin_create_membership_user',
    jsonb_build_object('package_id', v_pkg.id, 'phone', v_phone, 'email', _email, 'days', _days),
    ARRAY[v_order_id::text],
    1,
    jsonb_build_object('token_id', v_token_id, 'token', v_token, 'expires_at', v_expires)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'token_id', v_token_id,
    'token', v_token,
    'password', v_password,
    'expires_at', v_expires,
    'duration_days', _days,
    'package_name', v_pkg.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_membership_user(text, text, uuid, integer, integer, boolean, text) TO authenticated;
