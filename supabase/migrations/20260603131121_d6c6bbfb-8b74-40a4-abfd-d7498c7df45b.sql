GRANT SELECT ON public.active_shows TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.active_shows TO authenticated;
GRANT ALL ON public.active_shows TO service_role;