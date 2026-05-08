CREATE TABLE public.token_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  replay_id uuid,
  replay_title text NOT NULL DEFAULT '',
  order_id uuid,
  access_token text NOT NULL,
  link text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'bot',
  requested_by text NOT NULL DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_token_deliveries_sent_at ON public.token_deliveries(sent_at DESC);
CREATE INDEX idx_token_deliveries_phone ON public.token_deliveries(phone);

ALTER TABLE public.token_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read token_deliveries"
ON public.token_deliveries FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete token_deliveries"
ON public.token_deliveries FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));