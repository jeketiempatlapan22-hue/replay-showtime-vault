
CREATE TABLE public.active_shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  show_date date NOT NULL,
  show_time time NOT NULL DEFAULT '19:00:00',
  lineup text[] NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT 'reguler',
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.active_shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active shows"
  ON public.active_shows FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert active shows"
  ON public.active_shows FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update active shows"
  ON public.active_shows FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete active shows"
  ON public.active_shows FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_active_shows_updated_at
  BEFORE UPDATE ON public.active_shows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.active_shows REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_shows;
