CREATE TABLE IF NOT EXISTS public.bot_inbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text,
  device text,
  message text,
  command text,
  inbox_id text,
  from_me boolean DEFAULT false,
  event_name text NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_inbox_events_created ON public.bot_inbox_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_inbox_events_phone ON public.bot_inbox_events (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_inbox_events_inbox_id ON public.bot_inbox_events (inbox_id) WHERE inbox_id IS NOT NULL;

ALTER TABLE public.bot_inbox_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bot_inbox_events'
      AND policyname = 'Admins can view bot inbox events'
  ) THEN
    CREATE POLICY "Admins can view bot inbox events"
    ON public.bot_inbox_events
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;