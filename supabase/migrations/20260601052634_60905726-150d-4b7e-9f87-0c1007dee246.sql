-- Tabel catatan salin link reseller (terpisah dari audit log token issuance).
CREATE TABLE public.reseller_copy_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  reseller_phone text NOT NULL,
  reseller_label text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('show','replay','membership')),
  target_id uuid,
  target_title text NOT NULL DEFAULT ''
);

CREATE INDEX idx_reseller_copy_log_phone_target ON public.reseller_copy_log(reseller_phone, kind, target_id);
CREATE INDEX idx_reseller_copy_log_created ON public.reseller_copy_log(created_at DESC);

GRANT SELECT, DELETE ON public.reseller_copy_log TO authenticated;
GRANT ALL ON public.reseller_copy_log TO service_role;

ALTER TABLE public.reseller_copy_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read reseller_copy_log" ON public.reseller_copy_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins delete reseller_copy_log" ON public.reseller_copy_log
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

-- RPC: reseller mencatat satu kali salin (verifikasi via PIN, bypass RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.reseller_log_copy(
  _phone text, _pin text, _kind text, _target_id uuid, _target_title text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _kind NOT IN ('show','replay','membership') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  SELECT COALESCE(label,'') INTO v_label FROM public.bot_admins WHERE phone = _phone LIMIT 1;
  INSERT INTO public.reseller_copy_log(reseller_phone, reseller_label, kind, target_id, target_title)
  VALUES (_phone, COALESCE(v_label,''), _kind, _target_id, COALESCE(_target_title,''));
END; $$;

-- RPC: agregasi statistik salin milik reseller
CREATE OR REPLACE FUNCTION public.reseller_copy_stats(_phone text, _pin text)
RETURNS TABLE(kind text, target_id uuid, target_title text, copies bigint, last_copied timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
    SELECT l.kind, l.target_id, MAX(l.target_title) AS target_title,
           COUNT(*)::bigint AS copies, MAX(l.created_at) AS last_copied
    FROM public.reseller_copy_log l
    WHERE l.reseller_phone = _phone
    GROUP BY l.kind, l.target_id
    ORDER BY MAX(l.created_at) DESC;
END; $$;

-- RPC: admin agregasi statistik salin per reseller per target
CREATE OR REPLACE FUNCTION public.admin_reseller_copy_stats()
RETURNS TABLE(reseller_phone text, reseller_label text, kind text, target_id uuid,
              target_title text, copies bigint, last_copied timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT l.reseller_phone, MAX(l.reseller_label) AS reseller_label, l.kind, l.target_id,
           MAX(l.target_title) AS target_title, COUNT(*)::bigint AS copies, MAX(l.created_at) AS last_copied
    FROM public.reseller_copy_log l
    GROUP BY l.reseller_phone, l.kind, l.target_id
    ORDER BY l.reseller_phone, MAX(l.created_at) DESC;
END; $$;

-- RPC: admin hapus / reset catatan (semua atau per reseller)
CREATE OR REPLACE FUNCTION public.admin_clear_reseller_copy_log(_phone text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH d AS (
    DELETE FROM public.reseller_copy_log
    WHERE _phone IS NULL OR reseller_phone = _phone
    RETURNING 1
  ) SELECT COUNT(*) INTO v_count FROM d;
  RETURN COALESCE(v_count, 0);
END; $$;