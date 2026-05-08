
CREATE TABLE public.membership_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  password text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  duration_days integer NOT NULL DEFAULT 30,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  manual_resets_used integer NOT NULL DEFAULT 0,
  manual_resets_max integer NOT NULL DEFAULT 3,
  includes_replays boolean NOT NULL DEFAULT true,
  created_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_membership_tokens_token ON public.membership_tokens(token);
CREATE INDEX idx_membership_tokens_phone ON public.membership_tokens(phone);

ALTER TABLE public.membership_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage membership_tokens"
ON public.membership_tokens FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_membership_tokens_updated_at
BEFORE UPDATE ON public.membership_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.membership_token_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id uuid NOT NULL REFERENCES public.membership_tokens(id) ON DELETE CASCADE,
  browser_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_id, browser_id)
);

CREATE INDEX idx_membership_token_devices_token ON public.membership_token_devices(token_id);

ALTER TABLE public.membership_token_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage membership_token_devices"
ON public.membership_token_devices FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
