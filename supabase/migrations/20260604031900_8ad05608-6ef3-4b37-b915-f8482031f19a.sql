
-- 1) Lock down sensitive columns on active_shows from Data API
REVOKE SELECT (live_password, live_url, live_sources, replay_m3u8_url, replay_youtube_url)
  ON public.active_shows FROM anon, authenticated;

-- Re-affirm column-level lock on membership_packages.replay_info
REVOKE SELECT (replay_info) ON public.membership_packages FROM anon, authenticated;

-- service_role keeps full access (used by edge functions + SECURITY DEFINER RPCs)
GRANT SELECT ON public.active_shows TO service_role;
GRANT SELECT ON public.membership_packages TO service_role;

-- 2) Rebuild Realtime publication for active_shows with SAFE columns only.
-- Realtime broadcasts the row payload regardless of column GRANTs, so we must
-- restrict the publication itself to non-sensitive columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'active_shows'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.active_shows';
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.active_shows
  (id, title, show_date, show_time, lineup, category, description, image_url,
   sort_order, is_active, is_special, is_live, live_auto_schedule, live_type,
   live_require_password, replay_mode, replay_enabled, replay_id, idn_show_id,
   admin_alias, price_show, price_replay, price_show_coins, price_replay_coins,
   pakasir_amount, created_at, updated_at);
