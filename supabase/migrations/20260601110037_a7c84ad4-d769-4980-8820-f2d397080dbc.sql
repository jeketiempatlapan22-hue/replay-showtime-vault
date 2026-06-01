-- Restore Data API grants needed by admin tools, while keeping sensitive replay_info hidden from public reads.
GRANT SELECT (
  id, name, description, duration_days, price_idr, price_coins,
  pakasir_amount, quota_total, quota_reserved, max_devices,
  includes_replays, status, sort_order, paused, pause_message,
  created_at, updated_at
) ON public.membership_packages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.membership_packages TO authenticated;
GRANT ALL ON public.membership_packages TO service_role;
REVOKE SELECT (replay_info) ON public.membership_packages FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_tokens TO authenticated;
GRANT ALL ON public.membership_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_token_devices TO authenticated;
GRANT ALL ON public.membership_token_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_audit_log TO authenticated;
GRANT ALL ON public.reseller_audit_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.token_deliveries TO authenticated;
GRANT ALL ON public.token_deliveries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT SELECT ON public.site_settings TO anon;
GRANT ALL ON public.site_settings TO service_role;

INSERT INTO public.site_settings(key, value)
VALUES ('reseller_membership_replay_info', '')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reseller_list_membership_packages(_phone text, _pin text)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  replay_info text,
  duration_days integer,
  max_devices integer,
  includes_replays boolean,
  status text,
  paused boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reseller_info text := '';
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT COALESCE(value, '') INTO v_reseller_info
  FROM public.site_settings
  WHERE key = 'reseller_membership_replay_info'
  LIMIT 1;

  RETURN QUERY
    SELECT p.id, p.name, p.description,
           COALESCE(NULLIF(v_reseller_info, ''), p.replay_info, '') AS replay_info,
           p.duration_days, p.max_devices, p.includes_replays,
           p.status, COALESCE(p.paused, false) AS paused
    FROM public.membership_packages p
    WHERE p.status = 'open'
    ORDER BY p.sort_order, p.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.reseller_list_membership_packages(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reseller_list_membership_packages(text, text) TO anon, authenticated;