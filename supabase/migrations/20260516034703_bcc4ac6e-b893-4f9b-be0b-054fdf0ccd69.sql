ALTER TABLE public.active_show_tokens
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS single_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS used_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS used_by_browser_id text NULL;

CREATE INDEX IF NOT EXISTS idx_active_show_tokens_expires_at
  ON public.active_show_tokens(expires_at) WHERE expires_at IS NOT NULL;