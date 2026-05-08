
CREATE TABLE IF NOT EXISTS public.bot_rate_limit (
  phone text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_rate_limit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read rate limit" ON public.bot_rate_limit
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.replay_personal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  max_devices integer NOT NULL DEFAULT 1,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpt_replay ON public.replay_personal_tokens(replay_id);
ALTER TABLE public.replay_personal_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage replay_personal_tokens" ON public.replay_personal_tokens
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.replay_token_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.replay_personal_tokens(id) ON DELETE CASCADE,
  browser_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(token_id, browser_id)
);
ALTER TABLE public.replay_token_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage replay_token_devices" ON public.replay_token_devices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.bot_commands (trigger, description, response_template, is_dynamic, enabled, sort_order)
VALUES ('/tokensatuan', 'Buat token personal (1 device) untuk replay tertentu', '', true, true, 50)
ON CONFLICT (trigger) DO NOTHING;
