
-- ============ TABLES ============
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip inet NOT NULL,
  reason text NOT NULL DEFAULT '',
  auto_blocked boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  unblocked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_ips_active_ip_uniq
  ON public.blocked_ips(ip) WHERE is_active = true;

GRANT SELECT ON public.blocked_ips TO authenticated;
GRANT ALL ON public.blocked_ips TO service_role;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read blocked_ips" ON public.blocked_ips
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.ip_visit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip inet NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  path text NOT NULL DEFAULT '',
  endpoint text NOT NULL DEFAULT '',
  visit_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ip_visit_log_ip_idx ON public.ip_visit_log(ip);
CREATE INDEX IF NOT EXISTS ip_visit_log_last_seen_idx ON public.ip_visit_log(last_seen_at DESC);

GRANT SELECT ON public.ip_visit_log TO authenticated;
GRANT ALL ON public.ip_visit_log TO service_role;
ALTER TABLE public.ip_visit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read ip_visit_log" ON public.ip_visit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.rate_limit_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip inet NOT NULL,
  endpoint text NOT NULL DEFAULT '',
  violation_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_violations_ip_time_idx
  ON public.rate_limit_violations(ip, created_at DESC);

GRANT SELECT ON public.rate_limit_violations TO authenticated;
GRANT ALL ON public.rate_limit_violations TO service_role;
ALTER TABLE public.rate_limit_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read rate_limit_violations" ON public.rate_limit_violations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_ip_blocked(_ip inet)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocked_ips WHERE ip = _ip AND is_active = true);
$$;

CREATE OR REPLACE FUNCTION public.record_ip_visit(
  _ip inet,
  _user_agent text,
  _path text,
  _endpoint text,
  _max_per_min integer DEFAULT 60
)
RETURNS TABLE(blocked boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_count integer;
  v_violation_count integer;
BEGIN
  IF _ip IS NULL THEN
    RETURN QUERY SELECT false, ''::text; RETURN;
  END IF;

  -- Already blocked? short-circuit
  IF EXISTS (SELECT 1 FROM public.blocked_ips WHERE ip = _ip AND is_active = true) THEN
    RETURN QUERY SELECT true, 'blocked'::text; RETURN;
  END IF;

  -- Upsert visit row per (ip, endpoint) within last 1 minute, else create new
  SELECT id, visit_count INTO v_existing_id, v_count
    FROM public.ip_visit_log
   WHERE ip = _ip AND endpoint = _endpoint AND last_seen_at > now() - interval '1 minute'
   ORDER BY last_seen_at DESC LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.ip_visit_log
       SET visit_count = visit_count + 1,
           last_seen_at = now(),
           user_agent = COALESCE(NULLIF(_user_agent,''), user_agent),
           path = COALESCE(NULLIF(_path,''), path)
     WHERE id = v_existing_id
     RETURNING visit_count INTO v_count;
  ELSE
    INSERT INTO public.ip_visit_log(ip, user_agent, path, endpoint)
    VALUES (_ip, COALESCE(_user_agent,''), COALESCE(_path,''), COALESCE(_endpoint,''));
    v_count := 1;
  END IF;

  -- Janitor: prune visits >7 days
  DELETE FROM public.ip_visit_log WHERE last_seen_at < now() - interval '7 days';
  DELETE FROM public.rate_limit_violations WHERE created_at < now() - interval '24 hours';

  -- Rate limit check
  IF v_count > GREATEST(1, _max_per_min) THEN
    INSERT INTO public.rate_limit_violations(ip, endpoint, violation_count)
    VALUES (_ip, COALESCE(_endpoint,''), v_count);

    SELECT COUNT(*) INTO v_violation_count
      FROM public.rate_limit_violations
     WHERE ip = _ip AND created_at > now() - interval '10 minutes';

    -- Auto-block after 5 violations in 10 minutes
    IF v_violation_count >= 5 THEN
      INSERT INTO public.blocked_ips(ip, reason, auto_blocked, is_active)
      VALUES (_ip, 'auto: rate limit on '||COALESCE(_endpoint,''), true, true)
      ON CONFLICT DO NOTHING;
      RETURN QUERY SELECT true, 'auto_blocked'::text; RETURN;
    END IF;

    RETURN QUERY SELECT false, 'rate_limited'::text; RETURN;
  END IF;

  RETURN QUERY SELECT false, ''::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_block_ip(_ip inet, _reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  -- Deactivate any duplicate active row first
  UPDATE public.blocked_ips SET is_active = false, unblocked_at = now(), updated_at = now()
    WHERE ip = _ip AND is_active = true;
  INSERT INTO public.blocked_ips(ip, reason, auto_blocked, is_active, created_by)
  VALUES (_ip, COALESCE(_reason,'manual'), false, true, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_unblock_ip(_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.blocked_ips
     SET is_active = false, unblocked_at = now(), updated_at = now()
   WHERE id = _id;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_blocked_ips()
RETURNS SETOF public.blocked_ips
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM public.blocked_ips ORDER BY is_active DESC, blocked_at DESC LIMIT 500;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_ip_visits(_limit integer DEFAULT 200)
RETURNS SETOF public.ip_visit_log
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM public.ip_visit_log
    ORDER BY last_seen_at DESC LIMIT GREATEST(1, LEAST(_limit, 1000));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_ip_violations(_limit integer DEFAULT 200)
RETURNS SETOF public.rate_limit_violations
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM public.rate_limit_violations
    ORDER BY created_at DESC LIMIT GREATEST(1, LEAST(_limit, 1000));
END; $$;
