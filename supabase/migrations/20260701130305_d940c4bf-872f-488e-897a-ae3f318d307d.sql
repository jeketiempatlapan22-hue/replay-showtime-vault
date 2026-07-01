
-- Update list_tokens: include membership token revoked + device count
CREATE OR REPLACE FUNCTION public.reseller_list_tokens(_phone text, _pin text, _q text DEFAULT ''::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(audit_id uuid, kind text, target_id uuid, target_title text, token text, created_at timestamp with time zone, expires_at timestamp with time zone, revoked boolean, device_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
  SELECT a.id, a.kind, a.target_id, a.target_title, a.token, a.created_at, a.expires_at,
    COALESCE(
      CASE a.kind
        WHEN 'show' THEN (SELECT t.revoked FROM active_show_tokens t WHERE t.token = a.token LIMIT 1)
        WHEN 'replay' THEN (SELECT t.revoked FROM replay_personal_tokens t WHERE t.token = a.token LIMIT 1)
        WHEN 'membership' THEN (SELECT t.revoked FROM membership_tokens t WHERE t.token = a.token LIMIT 1)
        ELSE NULL
      END, true) AS revoked,
    COALESCE(
      CASE a.kind
        WHEN 'show' THEN (SELECT COUNT(*)::int FROM active_show_token_devices d
                            JOIN active_show_tokens t ON t.id = d.token_id WHERE t.token = a.token)
        WHEN 'replay' THEN (SELECT COUNT(*)::int FROM replay_token_devices d
                              JOIN replay_personal_tokens t ON t.id = d.token_id WHERE t.token = a.token)
        WHEN 'membership' THEN (SELECT COUNT(*)::int FROM membership_token_devices d
                              JOIN membership_tokens t ON t.id = d.token_id WHERE t.token = a.token)
        ELSE 0
      END, 0) AS device_count
  FROM reseller_audit_log a
  WHERE a.reseller_phone = _phone
    AND (COALESCE(_q,'') = '' OR a.target_title ILIKE '%'||_q||'%' OR a.token ILIKE '%'||_q||'%')
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200)) OFFSET GREATEST(0, _offset);
END $function$;

-- Update block_token: include membership + collect browser_ids from all kinds
CREATE OR REPLACE FUNCTION public.reseller_block_token(_phone text, _pin text, _audit_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        VALUES (b, 'reseller_block:'||_phone) ON CONFLICT DO NOTHING;
      n := n + 1;
    END LOOP;
    UPDATE active_show_tokens SET revoked = true WHERE token = r.token;
  ELSIF r.kind = 'replay' THEN
    FOR b IN
      SELECT DISTINCT d.browser_id FROM replay_token_devices d
        JOIN replay_personal_tokens t ON t.id = d.token_id WHERE t.token = r.token AND length(d.browser_id) >= 6
    LOOP
      INSERT INTO blocked_browsers(browser_id, reason)
        VALUES (b, 'reseller_block:'||_phone) ON CONFLICT DO NOTHING;
      n := n + 1;
    END LOOP;
    UPDATE replay_personal_tokens SET revoked = true WHERE token = r.token;
  ELSIF r.kind = 'membership' THEN
    FOR b IN
      SELECT DISTINCT d.browser_id FROM membership_token_devices d
        JOIN membership_tokens t ON t.id = d.token_id WHERE t.token = r.token AND length(d.browser_id) >= 6
    LOOP
      INSERT INTO blocked_browsers(browser_id, reason)
        VALUES (b, 'reseller_block:'||_phone) ON CONFLICT DO NOTHING;
      n := n + 1;
    END LOOP;
    UPDATE membership_tokens SET revoked = true WHERE token = r.token;
  END IF;
  RETURN n;
END $function$;

-- New: unblock token — remove blocked_browsers entries added by this reseller for the token's devices, and re-activate the token
CREATE OR REPLACE FUNCTION public.reseller_unblock_token(_phone text, _pin text, _audit_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0;
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT kind, token INTO r FROM reseller_audit_log WHERE id = _audit_id AND reseller_phone = _phone;
  IF r IS NULL THEN RETURN 0; END IF;

  IF r.kind = 'show' THEN
    WITH del AS (
      DELETE FROM blocked_browsers bb
      WHERE bb.reason = 'reseller_block:'||_phone
        AND bb.browser_id IN (
          SELECT DISTINCT d.browser_id FROM active_show_token_devices d
            JOIN active_show_tokens t ON t.id = d.token_id WHERE t.token = r.token
        )
      RETURNING 1
    ) SELECT count(*) INTO n FROM del;
    UPDATE active_show_tokens SET revoked = false WHERE token = r.token;
  ELSIF r.kind = 'replay' THEN
    WITH del AS (
      DELETE FROM blocked_browsers bb
      WHERE bb.reason = 'reseller_block:'||_phone
        AND bb.browser_id IN (
          SELECT DISTINCT d.browser_id FROM replay_token_devices d
            JOIN replay_personal_tokens t ON t.id = d.token_id WHERE t.token = r.token
        )
      RETURNING 1
    ) SELECT count(*) INTO n FROM del;
    UPDATE replay_personal_tokens SET revoked = false WHERE token = r.token;
  ELSIF r.kind = 'membership' THEN
    WITH del AS (
      DELETE FROM blocked_browsers bb
      WHERE bb.reason = 'reseller_block:'||_phone
        AND bb.browser_id IN (
          SELECT DISTINCT d.browser_id FROM membership_token_devices d
            JOIN membership_tokens t ON t.id = d.token_id WHERE t.token = r.token
        )
      RETURNING 1
    ) SELECT count(*) INTO n FROM del;
    UPDATE membership_tokens SET revoked = false WHERE token = r.token;
  END IF;

  RETURN COALESCE(n, 0);
END $function$;

GRANT EXECUTE ON FUNCTION public.reseller_unblock_token(text, text, uuid) TO anon, authenticated, service_role;
