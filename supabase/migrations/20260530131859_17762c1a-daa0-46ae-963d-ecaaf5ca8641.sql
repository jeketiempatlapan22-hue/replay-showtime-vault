ALTER TABLE public.bot_admins ADD COLUMN IF NOT EXISTS pin text NOT NULL DEFAULT '';
ALTER TABLE public.bot_admins ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE OR REPLACE FUNCTION public.reseller_login(_phone text, _pin text)
RETURNS TABLE(ok boolean, phone text, label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.bot_admins%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.bot_admins WHERE bot_admins.phone = _phone AND enabled = true LIMIT 1;
  IF NOT FOUND OR COALESCE(r.pin,'') = '' OR r.pin <> _pin THEN
    RETURN QUERY SELECT false, ''::text, ''::text; RETURN;
  END IF;
  UPDATE public.bot_admins SET last_login_at = now() WHERE id = r.id;
  RETURN QUERY SELECT true, r.phone, COALESCE(r.label,'');
END; $$;

CREATE OR REPLACE FUNCTION public.reseller_verify(_phone text, _pin text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.bot_admins
    WHERE phone = _phone AND enabled = true AND COALESCE(pin,'') <> '' AND pin = _pin
  );
$$;

CREATE OR REPLACE FUNCTION public.reseller_list_shows(_phone text, _pin text)
RETURNS TABLE(id uuid, title text, show_date date, show_time time, image_url text, category text, is_live boolean, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
    SELECT s.id, s.title, s.show_date, s.show_time, s.image_url, s.category, s.is_live, s.is_active
    FROM public.active_shows s
    WHERE s.is_active = true
    ORDER BY s.is_live DESC, s.show_date DESC, s.show_time DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.reseller_list_replays(_phone text, _pin text, _limit int, _offset int, _q text)
RETURNS TABLE(id uuid, title text, show_name text, date date, image_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
    SELECT r.id, r.title, r.show_name, r.date, r.image_url
    FROM public.replays r
    WHERE COALESCE(_q,'') = '' OR r.title ILIKE '%'||_q||'%' OR r.show_name ILIKE '%'||_q||'%'
    ORDER BY r.date DESC, r.show_time DESC NULLS LAST
    LIMIT GREATEST(1, LEAST(COALESCE(_limit,20), 100))
    OFFSET GREATEST(0, COALESCE(_offset,0));
END; $$;

GRANT EXECUTE ON FUNCTION public.reseller_login(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_list_shows(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_list_replays(text,text,int,int,text) TO anon, authenticated;