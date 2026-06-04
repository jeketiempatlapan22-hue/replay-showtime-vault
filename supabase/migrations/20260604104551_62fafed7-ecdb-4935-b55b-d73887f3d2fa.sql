REVOKE ALL ON TABLE public.active_shows FROM anon, authenticated;

GRANT SELECT (
  id,
  title,
  show_date,
  show_time,
  lineup,
  category,
  description,
  image_url,
  sort_order,
  is_active,
  is_special,
  created_at,
  updated_at,
  price_show,
  price_replay,
  pakasir_amount,
  replay_id,
  replay_enabled,
  is_live,
  live_auto_schedule,
  live_type,
  live_require_password,
  replay_mode,
  admin_alias,
  price_show_coins,
  price_replay_coins,
  idn_show_id
) ON public.active_shows TO anon, authenticated;

GRANT ALL ON TABLE public.active_shows TO service_role;