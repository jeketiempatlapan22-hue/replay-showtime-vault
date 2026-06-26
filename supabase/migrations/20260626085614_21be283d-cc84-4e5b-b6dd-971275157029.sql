
-- =========================
-- ADMIN: MEMBERSHIP USERS
-- =========================
CREATE OR REPLACE FUNCTION public.admin_list_membership_users(_q text DEFAULT '', _status text DEFAULT 'all')
RETURNS TABLE(
  order_id uuid, user_id uuid, email text, phone text, kind text,
  amount integer, coin_amount integer, paid_at timestamptz, created_at timestamptz,
  package_id uuid, package_name text,
  token_id uuid, token text, password text,
  starts_at timestamptz, expires_at timestamptz, duration_days integer,
  max_devices integer, includes_replays boolean, revoked boolean,
  devices_used integer, days_remaining integer, status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT
    o.id, o.user_id, o.email, o.phone, o.kind,
    o.amount, o.coin_amount, o.paid_at, o.created_at,
    o.package_id, COALESCE(p.name,''),
    t.id, COALESCE(t.token,''), COALESCE(t.password,''),
    t.starts_at, t.expires_at, COALESCE(t.duration_days, p.duration_days),
    COALESCE(t.max_devices, p.max_devices, 1),
    COALESCE(t.includes_replays, p.includes_replays, true),
    COALESCE(t.revoked, false),
    COALESCE((SELECT count(*)::int FROM public.membership_token_devices d WHERE d.token_id = t.id), 0),
    CASE WHEN t.expires_at IS NULL THEN NULL
         ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (t.expires_at - now()))/86400.0))::int END,
    CASE
      WHEN COALESCE(t.revoked,false) THEN 'revoked'
      WHEN t.expires_at IS NULL THEN 'active'
      WHEN t.expires_at > now() THEN 'active'
      ELSE 'expired'
    END
  FROM public.membership_orders o
  LEFT JOIN public.membership_packages p ON p.id = o.package_id
  LEFT JOIN public.membership_tokens t ON t.id = o.membership_token_id
  WHERE o.status = 'paid'
    AND (
      COALESCE(_q,'') = '' OR
      o.email ILIKE '%'||_q||'%' OR
      o.phone ILIKE '%'||_q||'%' OR
      COALESCE(t.token,'') ILIKE '%'||_q||'%' OR
      COALESCE(p.name,'') ILIKE '%'||_q||'%'
    )
    AND (
      _status = 'all' OR
      (_status = 'active' AND COALESCE(t.revoked,false)=false AND (t.expires_at IS NULL OR t.expires_at > now())) OR
      (_status = 'expired' AND t.expires_at IS NOT NULL AND t.expires_at <= now()) OR
      (_status = 'revoked' AND COALESCE(t.revoked,false)=true)
    )
  ORDER BY o.paid_at DESC NULLS LAST, o.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_membership_user(
  _order_id uuid, _email text, _phone text,
  _expires_at timestamptz, _max_devices integer,
  _includes_replays boolean, _revoked boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.membership_orders
    SET email = COALESCE(_email, email),
        phone = COALESCE(_phone, phone),
        updated_at = now()
    WHERE id = _order_id
  RETURNING membership_token_id INTO v_token_id;

  IF v_token_id IS NOT NULL THEN
    UPDATE public.membership_tokens
      SET expires_at = COALESCE(_expires_at, expires_at),
          max_devices = COALESCE(_max_devices, max_devices),
          includes_replays = COALESCE(_includes_replays, includes_replays),
          revoked = COALESCE(_revoked, revoked),
          phone = COALESCE(_phone, phone),
          updated_at = now()
      WHERE id = v_token_id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_membership_user(_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT membership_token_id INTO v_token_id FROM public.membership_orders WHERE id = _order_id;
  DELETE FROM public.membership_orders WHERE id = _order_id;
  IF v_token_id IS NOT NULL THEN
    DELETE FROM public.membership_tokens WHERE id = v_token_id;
  END IF;
END; $$;

-- =========================
-- ADMIN: TOKEN FACTORY
-- =========================

-- SHOW TOKENS
CREATE OR REPLACE FUNCTION public.admin_list_show_tokens(_q text DEFAULT '', _status text DEFAULT 'active')
RETURNS TABLE(
  id uuid, token text, label text, kind text,
  show_id uuid, show_title text, show_date date,
  max_devices integer, devices_used integer,
  revoked boolean, single_use boolean,
  created_at timestamptz, expires_at timestamptz, status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT t.id, t.token, t.label, t.kind,
    t.show_id, COALESCE(s.title,''), s.show_date,
    t.max_devices,
    COALESCE((SELECT count(*)::int FROM public.active_show_token_devices d WHERE d.token_id = t.id),0),
    t.revoked, t.single_use, t.created_at, t.expires_at,
    CASE
      WHEN t.revoked THEN 'revoked'
      WHEN t.expires_at IS NOT NULL AND t.expires_at <= now() THEN 'expired'
      ELSE 'active'
    END
  FROM public.active_show_tokens t
  LEFT JOIN public.active_shows s ON s.id = t.show_id
  WHERE (
    COALESCE(_q,'') = '' OR
    t.token ILIKE '%'||_q||'%' OR
    t.label ILIKE '%'||_q||'%' OR
    COALESCE(s.title,'') ILIKE '%'||_q||'%'
  )
  AND (
    _status = 'all' OR
    (_status = 'active' AND t.revoked = false AND (t.expires_at IS NULL OR t.expires_at > now())) OR
    (_status = 'expired' AND ((t.expires_at IS NOT NULL AND t.expires_at <= now()) OR t.revoked = true))
  )
  ORDER BY t.created_at DESC
  LIMIT 1000;
END; $$;

-- MEMBERSHIP TOKENS
CREATE OR REPLACE FUNCTION public.admin_list_membership_tokens(_q text DEFAULT '', _status text DEFAULT 'active')
RETURNS TABLE(
  id uuid, token text, password text, label text, phone text,
  package_id uuid, package_name text,
  starts_at timestamptz, expires_at timestamptz, duration_days integer,
  max_devices integer, devices_used integer,
  includes_replays boolean, revoked boolean,
  created_by text, created_at timestamptz, status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT t.id, t.token, t.password, t.label, t.phone,
    t.package_id, COALESCE(p.name,''),
    t.starts_at, t.expires_at, t.duration_days,
    t.max_devices,
    COALESCE((SELECT count(*)::int FROM public.membership_token_devices d WHERE d.token_id = t.id),0),
    t.includes_replays, t.revoked, t.created_by, t.created_at,
    CASE
      WHEN t.revoked THEN 'revoked'
      WHEN t.expires_at <= now() THEN 'expired'
      ELSE 'active'
    END
  FROM public.membership_tokens t
  LEFT JOIN public.membership_packages p ON p.id = t.package_id
  WHERE (
    COALESCE(_q,'') = '' OR
    t.token ILIKE '%'||_q||'%' OR
    t.label ILIKE '%'||_q||'%' OR
    t.phone ILIKE '%'||_q||'%' OR
    COALESCE(p.name,'') ILIKE '%'||_q||'%'
  )
  AND (
    _status = 'all' OR
    (_status = 'active' AND t.revoked = false AND t.expires_at > now()) OR
    (_status = 'expired' AND (t.expires_at <= now() OR t.revoked = true))
  )
  ORDER BY t.created_at DESC
  LIMIT 1000;
END; $$;

-- Reset devices (kuota balik 0)
CREATE OR REPLACE FUNCTION public.admin_reset_token_devices(_kind text, _token_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _kind = 'show' THEN
    WITH d AS (DELETE FROM public.active_show_token_devices WHERE token_id = _token_id RETURNING 1)
    SELECT count(*) INTO v_n FROM d;
    UPDATE public.active_show_tokens SET used_at = NULL, used_by_browser_id = NULL WHERE id = _token_id;
  ELSIF _kind = 'membership' THEN
    WITH d AS (DELETE FROM public.membership_token_devices WHERE token_id = _token_id RETURNING 1)
    SELECT count(*) INTO v_n FROM d;
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;
  RETURN v_n;
END; $$;

-- Block token: revoke + push browser ids ke blocked_browsers
CREATE OR REPLACE FUNCTION public.admin_block_token(_kind text, _token_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text; v_n integer := 0; b text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _kind = 'show' THEN
    UPDATE public.active_show_tokens SET revoked = true WHERE id = _token_id RETURNING token INTO v_token;
    FOR b IN SELECT DISTINCT browser_id FROM public.active_show_token_devices WHERE token_id = _token_id AND length(browser_id) >= 6 LOOP
      INSERT INTO public.blocked_browsers(browser_id, reason)
        VALUES (b, 'admin_block_token:show:'||COALESCE(v_token,''))
        ON CONFLICT (browser_id) DO UPDATE SET unblocked = false, reason = EXCLUDED.reason, updated_at = now();
      v_n := v_n + 1;
    END LOOP;
  ELSIF _kind = 'membership' THEN
    UPDATE public.membership_tokens SET revoked = true, updated_at = now() WHERE id = _token_id RETURNING token INTO v_token;
    FOR b IN SELECT DISTINCT browser_id FROM public.membership_token_devices WHERE token_id = _token_id AND length(browser_id) >= 6 LOOP
      INSERT INTO public.blocked_browsers(browser_id, reason)
        VALUES (b, 'admin_block_token:membership:'||COALESCE(v_token,''))
        ON CONFLICT (browser_id) DO UPDATE SET unblocked = false, reason = EXCLUDED.reason, updated_at = now();
      v_n := v_n + 1;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;
  RETURN v_n;
END; $$;

-- Unblock token: clear revoke + un-block browsers
CREATE OR REPLACE FUNCTION public.admin_unblock_token(_kind text, _token_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _kind = 'show' THEN
    UPDATE public.active_show_tokens SET revoked = false WHERE id = _token_id;
    WITH u AS (
      DELETE FROM public.blocked_browsers
      WHERE browser_id IN (SELECT browser_id FROM public.active_show_token_devices WHERE token_id = _token_id)
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM u;
  ELSIF _kind = 'membership' THEN
    UPDATE public.membership_tokens SET revoked = false, updated_at = now() WHERE id = _token_id;
    WITH u AS (
      DELETE FROM public.blocked_browsers
      WHERE browser_id IN (SELECT browser_id FROM public.membership_token_devices WHERE token_id = _token_id)
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM u;
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;
  RETURN v_n;
END; $$;

-- Delete token
CREATE OR REPLACE FUNCTION public.admin_delete_token(_kind text, _token_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _kind = 'show' THEN
    DELETE FROM public.active_show_tokens WHERE id = _token_id;
  ELSIF _kind = 'membership' THEN
    UPDATE public.membership_orders SET membership_token_id = NULL WHERE membership_token_id = _token_id;
    DELETE FROM public.membership_tokens WHERE id = _token_id;
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;
END; $$;

-- Bulk delete expired tokens
CREATE OR REPLACE FUNCTION public.admin_bulk_delete_expired_tokens(_kind text, _ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _kind = 'show' THEN
    WITH d AS (
      DELETE FROM public.active_show_tokens
      WHERE (
        (_ids IS NOT NULL AND id = ANY(_ids))
        OR (_ids IS NULL AND ((expires_at IS NOT NULL AND expires_at <= now()) OR revoked = true))
      )
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
  ELSIF _kind = 'membership' THEN
    WITH src AS (
      SELECT id FROM public.membership_tokens
      WHERE (
        (_ids IS NOT NULL AND id = ANY(_ids))
        OR (_ids IS NULL AND (expires_at <= now() OR revoked = true))
      )
    ),
    upd AS (
      UPDATE public.membership_orders SET membership_token_id = NULL
      WHERE membership_token_id IN (SELECT id FROM src)
      RETURNING 1
    ),
    d AS (
      DELETE FROM public.membership_tokens WHERE id IN (SELECT id FROM src) RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;
  RETURN v_n;
END; $$;
