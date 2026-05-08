
-- BOT COMMANDS
CREATE TABLE public.bot_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  response_template text NOT NULL DEFAULT '',
  is_dynamic boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view enabled commands"
  ON public.bot_commands FOR SELECT TO public USING (true);
CREATE POLICY "Admins insert commands"
  ON public.bot_commands FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update commands"
  ON public.bot_commands FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete commands"
  ON public.bot_commands FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER bot_commands_updated
  BEFORE UPDATE ON public.bot_commands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ORDERS
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_phone text NOT NULL,
  replay_id uuid,
  show_id uuid,
  item_title text NOT NULL DEFAULT '',
  amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  pakasir_order_id text UNIQUE,
  pakasir_qr_url text NOT NULL DEFAULT '',
  access_token text,
  token_sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_phone ON public.orders(user_phone);
CREATE INDEX idx_orders_status ON public.orders(status);

CREATE POLICY "Users view own orders"
  ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins view all orders"
  ON public.orders FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete orders"
  ON public.orders FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER orders_updated
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- WA OUTBOX (log)
CREATE TABLE public.wa_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  fonnte_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wa_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read outbox"
  ON public.wa_outbox FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed default commands
INSERT INTO public.bot_commands (trigger, description, response_template, is_dynamic, sort_order) VALUES
  ('/menu',  'Tampilkan daftar command',           E'📋 *MENU BOT*\n\n/menu — daftar command\n/show — daftar show aktif\n/token <kode> — kirim ulang link token\n/admin — hubungi admin', false, 1),
  ('/show',  'Daftar show aktif (auto dari DB)',   '', true, 2),
  ('/token', 'Cek/kirim ulang link token order',   '', true, 3),
  ('/admin', 'Info kontak admin',                  E'👤 *Hubungi Admin*\n\nWA: wa.me/{{ADMIN_PHONE}}\nAtau balas pesan ini, admin akan merespons.', false, 4);
