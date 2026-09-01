ALTER TABLE public.replay_personal_tokens
  ADD COLUMN IF NOT EXISTS manual_resets_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_resets_max integer NOT NULL DEFAULT 3;

ALTER TABLE public.live_tokens
  ADD COLUMN IF NOT EXISTS manual_resets_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_resets_max integer NOT NULL DEFAULT 3;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS manual_resets_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_resets_max integer NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS public.order_token_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  browser_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, browser_id)
);

GRANT ALL ON public.order_token_devices TO service_role;
GRANT SELECT ON public.order_token_devices TO authenticated;
ALTER TABLE public.order_token_devices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_token_devices' AND policyname = 'Admins can view order devices'
  ) THEN
    CREATE POLICY "Admins can view order devices" ON public.order_token_devices
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_show_token_device ON public.active_show_token_devices (token_id, browser_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_replay_token_device ON public.replay_token_devices (token_id, browser_id);