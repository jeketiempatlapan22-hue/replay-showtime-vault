
-- ============== members ==============
CREATE TABLE IF NOT EXISTS public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  photo_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS members_name_lower_uniq ON public.members (lower(name));

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view members" ON public.members FOR SELECT USING (true);
CREATE POLICY "Admins can insert members" ON public.members FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update members" ON public.members FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete members" ON public.members FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER members_set_updated_at BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== member-photos bucket ==============
INSERT INTO storage.buckets (id, name, public) VALUES ('member-photos','member-photos',true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read member-photos" ON storage.objects FOR SELECT USING (bucket_id = 'member-photos');
CREATE POLICY "Admins upload member-photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-photos' AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update member-photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'member-photos' AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete member-photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'member-photos' AND has_role(auth.uid(),'admin'));

-- ============== live_messages ==============
CREATE TABLE IF NOT EXISTS public.live_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT 'Anonim',
  message text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_messages_created_idx ON public.live_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS live_messages_pinned_idx ON public.live_messages (pinned) WHERE pinned;

ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view live_messages" ON public.live_messages FOR SELECT USING (true);
CREATE POLICY "Anyone insert live_messages" ON public.live_messages FOR INSERT WITH CHECK (is_admin = false AND pinned = false);
CREATE POLICY "Admins insert live_messages" ON public.live_messages FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update live_messages" ON public.live_messages FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete live_messages" ON public.live_messages FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- Auto-prune: keep latest 30 non-pinned live messages
CREATE OR REPLACE FUNCTION public.prune_old_live_messages()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.live_messages
  WHERE pinned = false
    AND id NOT IN (
      SELECT id FROM public.live_messages
      WHERE pinned = false
      ORDER BY created_at DESC
      LIMIT 30
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER live_messages_prune AFTER INSERT ON public.live_messages
  FOR EACH ROW EXECUTE FUNCTION public.prune_old_live_messages();

ALTER TABLE public.live_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
