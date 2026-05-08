
ALTER TABLE public.active_shows ADD COLUMN IF NOT EXISTS admin_alias text;
CREATE UNIQUE INDEX IF NOT EXISTS active_shows_admin_alias_key ON public.active_shows (lower(admin_alias)) WHERE admin_alias IS NOT NULL AND admin_alias <> '';

CREATE TABLE IF NOT EXISTS public.active_show_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES public.active_shows(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'personal',
  max_devices integer NOT NULL DEFAULT 1,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.active_show_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage active_show_tokens" ON public.active_show_tokens
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.active_show_token_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.active_show_tokens(id) ON DELETE CASCADE,
  browser_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_id, browser_id)
);
ALTER TABLE public.active_show_token_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage active_show_token_devices" ON public.active_show_token_devices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
