
-- Ratings table (anonymous, one per device per replay via browser_id)
CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_id uuid REFERENCES public.replays(id) ON DELETE CASCADE NOT NULL,
  browser_id text NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (replay_id, browser_id)
);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ratings" ON public.ratings FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert ratings" ON public.ratings FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update ratings" ON public.ratings FOR UPDATE TO public USING (true);

-- Comments table
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_id uuid REFERENCES public.replays(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT 'Anonim',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comments" ON public.comments FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert comments" ON public.comments FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can delete comments" ON public.comments FOR DELETE TO public USING (true);

-- View count on replays
ALTER TABLE public.replays ADD COLUMN view_count integer NOT NULL DEFAULT 0;

-- Enable realtime for comments and site_settings
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_settings;
