GRANT SELECT ON public.replays TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_shows TO authenticated;
GRANT SELECT ON public.active_shows TO anon;
GRANT ALL ON public.replays TO service_role;
GRANT ALL ON public.active_shows TO service_role;