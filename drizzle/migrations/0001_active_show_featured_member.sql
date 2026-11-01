ALTER TABLE public.active_shows ADD COLUMN IF NOT EXISTS featured_member text NOT NULL DEFAULT '';
GRANT SELECT (featured_member) ON public.active_shows TO anon, authenticated;
GRANT ALL ON public.active_shows TO service_role;