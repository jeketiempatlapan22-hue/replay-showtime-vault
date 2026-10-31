CREATE OR REPLACE FUNCTION public.norm_phone(_p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN d = '' THEN ''
    WHEN d LIKE '0%' THEN '62' || substr(d, 2)
    WHEN d LIKE '8%' THEN '62' || d
    ELSE d END
  FROM (SELECT regexp_replace(coalesce(_p,''), '\D', '', 'g') AS d) s
$$;

CREATE TABLE public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX blocked_users_phone_idx ON public.blocked_users(phone) WHERE active;
CREATE INDEX blocked_users_user_idx ON public.blocked_users(user_id) WHERE active;
GRANT SELECT ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read blocked users" ON public.blocked_users FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_search_users_by_phone(_q text)
RETURNS TABLE(user_id uuid, email text, username text, phone text, created_at timestamptz, blocked boolean, block_reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n text := public.norm_phone(_q);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(n) < 4 THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.user_id, p.email, p.username, p.phone, p.created_at,
    EXISTS(SELECT 1 FROM blocked_users b WHERE b.active AND (b.user_id = p.user_id OR (b.phone <> '' AND b.phone = public.norm_phone(p.phone)))),
    (SELECT b.reason FROM blocked_users b WHERE b.active AND (b.user_id = p.user_id OR (b.phone <> '' AND b.phone = public.norm_phone(p.phone))) LIMIT 1)
  FROM profiles p
  WHERE public.norm_phone(p.phone) LIKE '%' || n || '%'
  ORDER BY p.created_at DESC LIMIT 50;
END $$;

CREATE OR REPLACE FUNCTION public.admin_block_user(_user_id uuid, _phone text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE em text; ph text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT email, phone INTO em, ph FROM profiles WHERE user_id = _user_id;
  ph := public.norm_phone(coalesce(nullif(_phone,''), ph));
  IF _user_id IS NULL AND coalesce(ph,'') = '' THEN RAISE EXCEPTION 'phone_required'; END IF;
  INSERT INTO blocked_users(user_id, phone, email, reason, created_by)
  VALUES (_user_id, coalesce(ph,''), coalesce(em,''), coalesce(_reason,''), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.admin_unblock_user(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r blocked_users;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO r FROM blocked_users WHERE id = _id;
  UPDATE blocked_users SET active = false, updated_at = now()
  WHERE active AND (id = _id OR (r.user_id IS NOT NULL AND user_id = r.user_id) OR (r.phone <> '' AND phone = r.phone));
END $$;

CREATE OR REPLACE FUNCTION public.am_i_blocked()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM blocked_users b
    LEFT JOIN profiles p ON p.user_id = auth.uid()
    WHERE b.active AND auth.uid() IS NOT NULL
      AND (b.user_id = auth.uid() OR (b.phone <> '' AND b.phone = public.norm_phone(p.phone)))
  )
$$;

REVOKE EXECUTE ON FUNCTION public.admin_search_users_by_phone(text), public.admin_block_user(uuid,text,text), public.admin_unblock_user(uuid), public.am_i_blocked() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_search_users_by_phone(text), public.admin_block_user(uuid,text,text), public.admin_unblock_user(uuid), public.am_i_blocked() TO authenticated;