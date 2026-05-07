
CREATE TABLE public.live_config_private (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  title text NOT NULL DEFAULT 'Live',
  type text NOT NULL DEFAULT 'm3u8',
  url text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  require_password boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.live_config_private ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access live_config" ON public.live_config_private
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));
INSERT INTO public.live_config_private (enabled,title,type,url,password) VALUES (false,'Live','m3u8','','');

CREATE TABLE public.live_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  label text NOT NULL DEFAULT '',
  max_devices integer NOT NULL DEFAULT 1,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.live_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage live_tokens" ON public.live_tokens
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.live_token_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.live_tokens(id) ON DELETE CASCADE,
  browser_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_id, browser_id)
);
ALTER TABLE public.live_token_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage live_token_devices" ON public.live_token_devices
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

-- Public-safe RPC to read live status (no secrets)
CREATE OR REPLACE FUNCTION public.get_live_status()
RETURNS TABLE(enabled boolean, title text, type text, require_password boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT enabled, title, type, require_password FROM public.live_config_private LIMIT 1;
$$;
