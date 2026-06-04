
-- Reset device bindings for all reseller tokens (admin) — does NOT delete the tokens or audit log.
CREATE OR REPLACE FUNCTION public.admin_reset_reseller_token_devices(_phone text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer := 0;
  v_n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH d AS (
    DELETE FROM public.active_show_token_devices dev
    USING public.active_show_tokens t, public.reseller_audit_log a
    WHERE dev.token_id = t.id
      AND a.token = t.token
      AND a.kind = 'show'
      AND (_phone IS NULL OR a.reseller_phone = _phone)
    RETURNING 1
  ) SELECT count(*) INTO v_n FROM d;
  v_total := v_total + COALESCE(v_n,0);

  WITH d AS (
    DELETE FROM public.replay_token_devices dev
    USING public.replay_personal_tokens t, public.reseller_audit_log a
    WHERE dev.token_id = t.id
      AND a.token = t.token
      AND a.kind = 'replay'
      AND (_phone IS NULL OR a.reseller_phone = _phone)
    RETURNING 1
  ) SELECT count(*) INTO v_n FROM d;
  v_total := v_total + COALESCE(v_n,0);

  WITH d AS (
    DELETE FROM public.membership_token_devices dev
    USING public.membership_tokens t, public.reseller_audit_log a
    WHERE dev.token_id = t.id
      AND a.token = t.token
      AND a.kind = 'membership'
      AND (_phone IS NULL OR a.reseller_phone = _phone)
    RETURNING 1
  ) SELECT count(*) INTO v_n FROM d;
  v_total := v_total + COALESCE(v_n,0);

  RETURN v_total;
END;
$$;

-- Reset device bindings for a single token from audit row (admin)
CREATE OR REPLACE FUNCTION public.admin_reset_reseller_audit_token_devices(_audit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT kind, token INTO r FROM public.reseller_audit_log WHERE id = _audit_id;
  IF r IS NULL THEN RETURN 0; END IF;

  IF r.kind = 'show' THEN
    WITH d AS (
      DELETE FROM public.active_show_token_devices dev
      USING public.active_show_tokens t
      WHERE dev.token_id = t.id AND t.token = r.token
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
  ELSIF r.kind = 'replay' THEN
    WITH d AS (
      DELETE FROM public.replay_token_devices dev
      USING public.replay_personal_tokens t
      WHERE dev.token_id = t.id AND t.token = r.token
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
  ELSIF r.kind = 'membership' THEN
    WITH d AS (
      DELETE FROM public.membership_token_devices dev
      USING public.membership_tokens t
      WHERE dev.token_id = t.id AND t.token = r.token
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
  END IF;

  RETURN COALESCE(v_n, 0);
END;
$$;

-- Reseller-facing: reset device bindings for one of their issued tokens (does NOT revoke/delete)
CREATE OR REPLACE FUNCTION public.reseller_reset_token_devices(_phone text, _pin text, _audit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT kind, token INTO r FROM public.reseller_audit_log
    WHERE id = _audit_id AND reseller_phone = _phone;
  IF r IS NULL THEN RETURN 0; END IF;

  IF r.kind = 'show' THEN
    WITH d AS (
      DELETE FROM public.active_show_token_devices dev
      USING public.active_show_tokens t
      WHERE dev.token_id = t.id AND t.token = r.token
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
  ELSIF r.kind = 'replay' THEN
    WITH d AS (
      DELETE FROM public.replay_token_devices dev
      USING public.replay_personal_tokens t
      WHERE dev.token_id = t.id AND t.token = r.token
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
  ELSIF r.kind = 'membership' THEN
    WITH d AS (
      DELETE FROM public.membership_token_devices dev
      USING public.membership_tokens t
      WHERE dev.token_id = t.id AND t.token = r.token
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
  END IF;

  RETURN COALESCE(v_n, 0);
END;
$$;
