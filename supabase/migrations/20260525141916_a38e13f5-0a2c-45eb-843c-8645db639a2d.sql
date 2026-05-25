
-- Retry tracking on membership_orders
ALTER TABLE public.membership_orders
  ADD COLUMN IF NOT EXISTS wa_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wa_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_last_error text,
  ADD COLUMN IF NOT EXISTS wa_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_membership_orders_wa_retry
  ON public.membership_orders (status, wa_attempts, wa_last_attempt_at);

-- Admin action logs
CREATE TABLE IF NOT EXISTS public.admin_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  affected_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read admin_action_logs" ON public.admin_action_logs;
CREATE POLICY "Admins read admin_action_logs"
ON public.admin_action_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at
  ON public.admin_action_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action
  ON public.admin_action_logs (action, created_at DESC);
