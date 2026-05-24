
-- 1. Restrict anon column access to replays (hide sensitive cols from PostgREST anon role)
REVOKE SELECT ON public.replays FROM anon;
GRANT SELECT (
  id, title, date, criteria, lineup, image_url, created_at, updated_at,
  show_name, featured_member, view_count, show_time, source_type,
  admin_alias, price_coins, sources
) ON public.replays TO anon;

-- Also restrict authenticated to non-sensitive columns; admin paths use SECURITY DEFINER RPCs
REVOKE SELECT ON public.replays FROM authenticated;
GRANT SELECT (
  id, title, date, criteria, lineup, image_url, created_at, updated_at,
  show_name, featured_member, view_count, show_time, source_type,
  admin_alias, price_coins, sources
) ON public.replays TO authenticated;

-- 2. Restrict anon + authenticated column access to active_shows
REVOKE SELECT ON public.active_shows FROM anon;
GRANT SELECT (
  id, title, show_date, show_time, lineup, category, description, image_url,
  sort_order, is_active, created_at, updated_at, price_show, price_replay,
  pakasir_amount, replay_id, replay_enabled, is_live, live_auto_schedule,
  live_type, live_require_password, replay_mode, admin_alias,
  price_show_coins, price_replay_coins, idn_show_id
) ON public.active_shows TO anon;

REVOKE SELECT ON public.active_shows FROM authenticated;
GRANT SELECT (
  id, title, show_date, show_time, lineup, category, description, image_url,
  sort_order, is_active, created_at, updated_at, price_show, price_replay,
  pakasir_amount, replay_id, replay_enabled, is_live, live_auto_schedule,
  live_type, live_require_password, replay_mode, admin_alias,
  price_show_coins, price_replay_coins, idn_show_id
) ON public.active_shows TO authenticated;

-- 3. Admin-only RPCs returning full rows (bypass column restriction)
CREATE OR REPLACE FUNCTION public.admin_get_replays()
RETURNS SETOF public.replays
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT * FROM public.replays ORDER BY date DESC, show_time DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_active_show(_id uuid)
RETURNS SETOF public.active_shows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT * FROM public.active_shows WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_active_shows()
RETURNS SETOF public.active_shows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT * FROM public.active_shows ORDER BY show_date DESC, show_time DESC;
END;
$$;

-- 4. Remove membership_orders from Realtime publication (prevents Realtime leak of phone/email)
ALTER PUBLICATION supabase_realtime DROP TABLE public.membership_orders;

-- 5. Restrict storage object listing (public CDN read still works for public buckets)
DROP POLICY IF EXISTS "Anyone can view card-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view member-photos" ON storage.objects;

CREATE POLICY "Admins can list card-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'card-images' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can list member-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'member-photos' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 6. Realtime.messages: restrict broadcast/presence channel access to authenticated users only
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can use realtime" ON realtime.messages;
CREATE POLICY "Authenticated can use realtime"
ON realtime.messages FOR SELECT
TO authenticated
USING (true);
