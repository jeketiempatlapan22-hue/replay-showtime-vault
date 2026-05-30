-- TTL for replay personal tokens
ALTER TABLE public.replay_personal_tokens ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Reseller audit log
CREATE TABLE IF NOT EXISTS public.reseller_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  reseller_phone text NOT NULL,
  reseller_label text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('show','replay','membership')),
  target_id uuid,
  target_title text NOT NULL DEFAULT '',
  token text NOT NULL DEFAULT '',
  expires_at timestamptz,
  duration_days int,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.reseller_audit_log TO authenticated;
GRANT ALL ON public.reseller_audit_log TO service_role;

ALTER TABLE public.reseller_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read reseller_audit_log"
  ON public.reseller_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_reseller_audit_created ON public.reseller_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reseller_audit_phone ON public.reseller_audit_log (reseller_phone);