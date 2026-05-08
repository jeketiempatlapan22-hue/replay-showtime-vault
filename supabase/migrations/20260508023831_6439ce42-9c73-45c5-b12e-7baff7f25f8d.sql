CREATE TABLE public.bot_inbox_dedup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  message_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_bot_inbox_dedup_uniq ON public.bot_inbox_dedup(phone, message_hash);
CREATE INDEX idx_bot_inbox_dedup_received ON public.bot_inbox_dedup(received_at);

ALTER TABLE public.bot_inbox_dedup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read dedup"
ON public.bot_inbox_dedup FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));