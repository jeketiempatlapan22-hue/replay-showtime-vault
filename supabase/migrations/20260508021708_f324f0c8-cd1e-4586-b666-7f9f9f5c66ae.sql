
CREATE TABLE public.bot_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bot_admins"
  ON public.bot_admins
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_bot_admins_updated_at
  BEFORE UPDATE ON public.bot_admins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.bot_admins (phone, label, enabled)
VALUES ('6288809048431', 'Owner', true)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO public.bot_commands (trigger, description, response_template, is_dynamic, enabled, sort_order)
VALUES (
  '/buattoken',
  'Buat link token akses replay (admin bot saja)',
  '',
  true,
  true,
  10
)
ON CONFLICT DO NOTHING;
