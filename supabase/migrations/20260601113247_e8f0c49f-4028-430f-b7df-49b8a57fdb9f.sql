CREATE OR REPLACE FUNCTION public.reseller_delete_token(_phone text, _pin text, _audit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT kind, token INTO r FROM public.reseller_audit_log
    WHERE id = _audit_id AND reseller_phone = _phone;
  IF r IS NULL THEN RETURN false; END IF;

  IF r.kind = 'show' THEN
    DELETE FROM public.active_show_token_devices d
      USING public.active_show_tokens t
      WHERE d.token_id = t.id AND t.token = r.token;
    DELETE FROM public.active_show_tokens WHERE token = r.token;
  ELSIF r.kind = 'replay' THEN
    DELETE FROM public.replay_token_devices d
      USING public.replay_personal_tokens t
      WHERE d.token_id = t.id AND t.token = r.token;
    DELETE FROM public.replay_personal_tokens WHERE token = r.token;
  ELSIF r.kind = 'membership' THEN
    DELETE FROM public.membership_token_devices d
      USING public.membership_tokens t
      WHERE d.token_id = t.id AND t.token = r.token;
    DELETE FROM public.membership_tokens WHERE token = r.token;
  END IF;

  DELETE FROM public.reseller_audit_log WHERE id = _audit_id;
  RETURN true;
END $function$;

GRANT EXECUTE ON FUNCTION public.reseller_delete_token(text, text, uuid) TO anon, authenticated;