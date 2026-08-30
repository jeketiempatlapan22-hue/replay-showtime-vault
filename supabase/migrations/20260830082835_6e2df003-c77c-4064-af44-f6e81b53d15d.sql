CREATE TABLE IF NOT EXISTS public.free_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint text NOT NULL,
  show_id uuid,
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.free_sessions TO service_role;

ALTER TABLE public.free_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view free sessions"
ON public.free_sessions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS free_sessions_fp_idx ON public.free_sessions (fingerprint, created_at DESC);

INSERT INTO public.site_settings (key, value)
VALUES ('free_mode_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.site_settings (key, value)
VALUES ('free_show_id', '')
ON CONFLICT (key) DO NOTHING;