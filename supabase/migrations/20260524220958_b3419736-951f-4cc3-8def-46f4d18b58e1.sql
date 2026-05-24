
-- ============= membership_packages =============
CREATE TABLE public.membership_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  replay_info text NOT NULL DEFAULT '',
  duration_days integer NOT NULL DEFAULT 30,
  price_idr integer NOT NULL DEFAULT 0,
  price_coins integer NOT NULL DEFAULT 0,
  pakasir_amount integer NOT NULL DEFAULT 0,
  quota_total integer NOT NULL DEFAULT 0,
  quota_reserved integer NOT NULL DEFAULT 0,
  max_devices integer NOT NULL DEFAULT 1,
  includes_replays boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'open',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_packages_status_chk CHECK (status IN ('open','closed')),
  CONSTRAINT membership_packages_quota_chk CHECK (quota_reserved >= 0 AND quota_reserved <= quota_total),
  CONSTRAINT membership_packages_duration_chk CHECK (duration_days > 0)
);

ALTER TABLE public.membership_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view membership_packages"
  ON public.membership_packages FOR SELECT
  USING (true);

CREATE POLICY "Admins manage membership_packages"
  ON public.membership_packages FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_membership_packages_updated
  BEFORE UPDATE ON public.membership_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= membership_orders =============
CREATE TABLE public.membership_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL,
  user_id uuid,
  email text NOT NULL,
  phone text NOT NULL,
  kind text NOT NULL DEFAULT 'qris',
  amount integer NOT NULL DEFAULT 0,
  coin_amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'reserved',
  pakasir_order_id text,
  pakasir_qr_url text NOT NULL DEFAULT '',
  membership_token_id uuid,
  reserved_until timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_orders_status_chk CHECK (status IN ('reserved','paid','expired','cancelled')),
  CONSTRAINT membership_orders_kind_chk CHECK (kind IN ('qris','coins'))
);

CREATE INDEX idx_membership_orders_package ON public.membership_orders(package_id);
CREATE INDEX idx_membership_orders_user ON public.membership_orders(user_id);
CREATE INDEX idx_membership_orders_pakasir ON public.membership_orders(pakasir_order_id);
CREATE INDEX idx_membership_orders_reserved_status ON public.membership_orders(status, reserved_until);

ALTER TABLE public.membership_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own membership_orders"
  ON public.membership_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage membership_orders"
  ON public.membership_orders FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_membership_orders_updated
  BEFORE UPDATE ON public.membership_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= RPC: reserve slot atomik =============
CREATE OR REPLACE FUNCTION public.reserve_membership_slot(
  _package_id uuid,
  _user_id uuid,
  _email text,
  _phone text,
  _kind text
) RETURNS TABLE(order_id uuid, amount integer, coin_amount integer, reserved_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg public.membership_packages%ROWTYPE;
  v_amount integer := 0;
  v_coin integer := 0;
  v_order_id uuid;
  v_reserved_until timestamptz := now() + interval '15 minutes';
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _kind NOT IN ('qris','coins') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
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
$$;

-- ============= RPC: release slot (expired/cancelled) =============
CREATE OR REPLACE FUNCTION public.release_membership_slot(_order_id uuid, _reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.membership_orders%ROWTYPE;
  v_new_status text;
BEGIN
  SELECT * INTO v_order FROM public.membership_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_order.status <> 'reserved' THEN RETURN false; END IF;

  v_new_status := CASE WHEN _reason = 'cancelled' THEN 'cancelled' ELSE 'expired' END;

  UPDATE public.membership_orders SET status = v_new_status, updated_at = now() WHERE id = _order_id;
  UPDATE public.membership_packages
    SET quota_reserved = GREATEST(0, quota_reserved - 1), updated_at = now()
    WHERE id = v_order.package_id;
  RETURN true;
END;
$$;

-- ============= RPC: finalize (paid → issue token) =============
CREATE OR REPLACE FUNCTION public.finalize_membership_order(_order_id uuid)
RETURNS TABLE(token text, password text, expires_at timestamptz, max_devices integer, includes_replays boolean, replay_info text, package_name text, duration_days integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.membership_orders%ROWTYPE;
  v_pkg public.membership_packages%ROWTYPE;
  v_token text;
  v_password text;
  v_expires timestamptz;
  v_existing_tok_id uuid;
  v_token_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.membership_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  -- Idempotency: jika sudah paid & ada token, ambil ulang.
  IF v_order.status = 'paid' AND v_order.membership_token_id IS NOT NULL THEN
    SELECT mt.token, mt.password, mt.expires_at, mt.max_devices, mt.includes_replays
      FROM public.membership_tokens mt
      WHERE mt.id = v_order.membership_token_id
      INTO v_token, v_password, v_expires, max_devices, includes_replays;
    SELECT name, duration_days, replay_info INTO package_name, duration_days, replay_info FROM public.membership_packages WHERE id = v_order.package_id;
    token := v_token; password := v_password; expires_at := v_expires;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_pkg FROM public.membership_packages WHERE id = v_order.package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found'; END IF;

  v_token := upper(replace(gen_random_uuid()::text, '-', ''));
  v_token := substring(v_token, 1, 12);
  v_password := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_expires := now() + make_interval(days => v_pkg.duration_days);

  INSERT INTO public.membership_tokens(
    token, password, label, phone, duration_days, starts_at, expires_at,
    includes_replays, max_devices, created_by
  ) VALUES (
    v_token, v_password,
    'pkg:' || v_pkg.name,
    v_order.phone,
    v_pkg.duration_days,
    now(),
    v_expires,
    v_pkg.includes_replays,
    v_pkg.max_devices,
    'purchase'
  ) RETURNING id INTO v_token_id;

  UPDATE public.membership_orders
    SET status = 'paid', paid_at = COALESCE(paid_at, now()), membership_token_id = v_token_id, updated_at = now()
    WHERE id = _order_id;

  token := v_token;
  password := v_password;
  expires_at := v_expires;
  max_devices := v_pkg.max_devices;
  includes_replays := v_pkg.includes_replays;
  replay_info := v_pkg.replay_info;
  package_name := v_pkg.name;
  duration_days := v_pkg.duration_days;
  RETURN NEXT;
END;
$$;

-- ============= Janitor: lepas slot yang expired =============
CREATE OR REPLACE FUNCTION public.expire_membership_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.membership_orders
    WHERE status = 'reserved' AND reserved_until < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.release_membership_slot(r.id, 'expired');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ============= Realtime =============
ALTER PUBLICATION supabase_realtime ADD TABLE public.membership_packages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.membership_orders;
ALTER TABLE public.membership_packages REPLICA IDENTITY FULL;
ALTER TABLE public.membership_orders REPLICA IDENTITY FULL;
