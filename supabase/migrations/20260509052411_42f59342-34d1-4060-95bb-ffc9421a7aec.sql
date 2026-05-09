
-- 1) Master passwords: remove public SELECT (admin ALL policy still applies)
DROP POLICY IF EXISTS "Anyone can view master_passwords" ON public.master_passwords;

-- 2) Replays: revoke sensitive columns from anon role
REVOKE SELECT ON public.replays FROM anon;
GRANT SELECT (id, title, show_name, date, criteria, featured_member, lineup, image_url, view_count, show_time, created_at, updated_at, source_type, admin_alias) ON public.replays TO anon;

-- 3) Active shows: revoke sensitive columns from anon
REVOKE SELECT ON public.active_shows FROM anon;
GRANT SELECT (id, title, show_date, show_time, lineup, category, image_url, description, sort_order, is_active, replay_id, replay_enabled, replay_youtube_url, replay_m3u8_url, is_live, live_auto_schedule, live_url, live_type, live_sources, live_require_password, replay_mode, admin_alias, price_replay, price_show, pakasir_amount, created_at, updated_at) ON public.active_shows TO anon;

-- 4) Card images storage: drop permissive INSERT/DELETE, add admin-only
DROP POLICY IF EXISTS "Anyone can upload card images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete card images" ON storage.objects;

CREATE POLICY "Admins upload card images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'card-images' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete card images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'card-images' AND public.has_role(auth.uid(), 'admin'::app_role));
