CREATE TABLE IF NOT EXISTS public.tv_pair_codes (
  code TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  show_id TEXT,
  browser_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

GRANT ALL ON public.tv_pair_codes TO service_role;

ALTER TABLE public.tv_pair_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS tv_pair_codes_expires_idx ON public.tv_pair_codes (expires_at);