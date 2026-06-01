
-- Reseller can list, revoke, and block their issued tokens; admin can revoke any reseller token.

CREATE OR REPLACE FUNCTION public.reseller_list_tokens(
  _phone text, _pin text, _q text DEFAULT '', _limit int DEFAULT 50, _offset int DEFAULT 0
)
RETURNS TABLE(
  audit_id uuid, kind text, target_id uuid, target_title text,
  token text, created_at timestamptz, expires_at timestamptz,
  revoked boolean, device_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
  SELECT a.id, a.kind, a.target_id, a.target_title, a.token, a.created_at, a.expires_at,
    COALESCE(
      CASE a.kind
        WHEN 'show' THEN (SELECT t.revoked FROM active_show_tokens t WHERE t.token = a.token LIMIT 1)
        WHEN 'replay' THEN (SELECT t.revoked FROM replay_personal_tokens t WHERE t.token = a.token LIMIT 1)
        ELSE NULL
      END, true) AS revoked,
    COALESCE(
      CASE a.kind
        WHEN 'show' THEN (SELECT COUNT(*)::int FROM active_show_token_devices d
                            JOIN active_show_tokens t ON t.id = d.token_id WHERE t.token = a.token)
        WHEN 'replay' THEN (SELECT COUNT(*)::int FROM replay_token_devices d
                              JOIN replay_personal_tokens t ON t.id = d.token_id WHERE t.token = a.token)
        ELSE 0
      END, 0) AS device_count
  FROM reseller_audit_log a
  WHERE a.reseller_phone = _phone
    AND (COALESCE(_q,'') = '' OR a.target_title ILIKE '%'||_q||'%' OR a.token ILIKE '%'||_q||'%')
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200)) OFFSET GREATEST(0, _offset);
END $$;

CREATE OR REPLACE FUNCTION public.reseller_revoke_token(_phone text, _pin text, _audit_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT kind, token INTO r FROM reseller_audit_log WHERE id = _audit_id AND reseller_phone = _phone;
  IF r IS NULL THEN RETURN false; END IF;
  IF r.kind = 'show' THEN
    UPDATE active_show_tokens SET revoked = true WHERE token = r.token;
  ELSIF r.kind = 'replay' THEN
    UPDATE replay_personal_tokens SET revoked = true WHERE token = r.token;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.reseller_block_token(_phone text, _pin text, _audit_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; b text;
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT kind, token INTO r FROM reseller_audit_log WHERE id = _audit_id AND reseller_phone = _phone;
  IF r IS NULL THEN RETURN 0; END IF;

  IF r.kind = 'show' THEN
    FOR b IN
      SELECT DISTINCT d.browser_id FROM active_show_token_devices d
        JOIN active_show_tokens t ON t.id = d.token_id WHERE t.token = r.token AND length(d.browser_id) >= 6
    LOOP
      INSERT INTO blocked_browsers(browser_id, reason)
        VALUES (b, 'reseller_block:'||_phone)
        ON CONFLICT DO NOTHING;
      n := n + 1;
    END LOOP;
    UPDATE active_show_tokens SET revoked = true WHERE token = r.token;
  ELSIF r.kind = 'replay' THEN
    FOR b IN
      SELECT DISTINCT d.browser_id FROM replay_token_devices d
        JOIN replay_personal_tokens t ON t.id = d.token_id WHERE t.token = r.token AND length(d.browser_id) >= 6
    LOOP
      INSERT INTO blocked_browsers(browser_id, reason)
        VALUES (b, 'reseller_block:'||_phone)
        ON CONFLICT DO NOTHING;
      n := n + 1;
    END LOOP;
    UPDATE replay_personal_tokens SET revoked = true WHERE token = r.token;
  END IF;
  RETURN n;
END $$;

-- Admin: revoke a single audit token, or revoke ALL tokens for a reseller ("habiskan")
CREATE OR REPLACE FUNCTION public.admin_revoke_reseller_token(_audit_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT kind, token INTO r FROM reseller_audit_log WHERE id = _audit_id;
  IF r IS NULL THEN RETURN false; END IF;
  IF r.kind = 'show' THEN
    UPDATE active_show_tokens SET revoked = true WHERE token = r.token;
  ELSIF r.kind = 'replay' THEN
    UPDATE replay_personal_tokens SET revoked = true WHERE token = r.token;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_exhaust_reseller_tokens(_phone text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE active_show_tokens SET revoked = true
    WHERE token IN (SELECT token FROM reseller_audit_log WHERE reseller_phone = _phone AND kind='show')
    AND revoked = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE replay_personal_tokens SET revoked = true
    WHERE token IN (SELECT token FROM reseller_audit_log WHERE reseller_phone = _phone AND kind='replay')
    AND revoked = false;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.reseller_list_tokens(text,text,text,int,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_revoke_token(text,text,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_block_token(text,text,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_reseller_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_exhaust_reseller_tokens(text) TO authenticated;
