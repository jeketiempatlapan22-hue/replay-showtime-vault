ALTER TABLE public.membership_packages
  ADD COLUMN IF NOT EXISTS show_to_reseller boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_to_user boolean NOT NULL DEFAULT true;
ALTER TABLE public.membership_tokens
  ADD COLUMN IF NOT EXISTS manual_resets_day date;

CREATE OR REPLACE FUNCTION public.reseller_list_membership_packages(_phone text, _pin text)
 RETURNS TABLE(id uuid, name text, description text, replay_info text, duration_days integer, max_devices integer, includes_replays boolean, status text, paused boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_reseller_info text := '';
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT COALESCE(value, '') INTO v_reseller_info FROM public.site_settings WHERE key = 'reseller_membership_replay_info' LIMIT 1;
  RETURN QUERY
    SELECT p.id, p.name, p.description,
           COALESCE(NULLIF(v_reseller_info, ''), p.replay_info, '') AS replay_info,
           p.duration_days, p.max_devices, p.includes_replays,
           p.status, COALESCE(p.paused, false) AS paused
    FROM public.membership_packages p
    WHERE COALESCE(p.paused, false) = false AND p.show_to_reseller = true
    ORDER BY p.sort_order, p.created_at;
END;
$function$;