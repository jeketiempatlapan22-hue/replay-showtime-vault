CREATE TABLE public.tv_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  show_id text,
  browser_id text,
  claims jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours')
);

GRANT ALL ON public.tv_sessions TO service_role;

ALTER TABLE public.tv_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX tv_sessions_expires_idx ON public.tv_sessions (expires_at);