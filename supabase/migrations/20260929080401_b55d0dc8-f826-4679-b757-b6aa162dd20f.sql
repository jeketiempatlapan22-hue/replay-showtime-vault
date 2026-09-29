CREATE TABLE public.game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  game_type text NOT NULL DEFAULT 'quiz',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL DEFAULT now() + interval '1 day',
  is_published boolean NOT NULL DEFAULT false,
  prizes jsonb NOT NULL DEFAULT '[{"kind":"coins","coins":3,"weight":1}]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.game_rounds TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.game_rounds TO authenticated;
GRANT ALL ON public.game_rounds TO service_role;
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read published rounds" ON public.game_rounds FOR SELECT USING (is_published OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin manage rounds" ON public.game_rounds FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.game_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  prompt text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  answer text NOT NULL DEFAULT '',
  alt_answers text[] NOT NULL DEFAULT '{}',
  reveal_image_url text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_questions TO authenticated;
GRANT ALL ON public.game_questions TO service_role;
ALTER TABLE public.game_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage questions" ON public.game_questions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.game_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  correct_count integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  won boolean NOT NULL DEFAULT false,
  prize jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)
);
GRANT SELECT, DELETE ON public.game_entries TO authenticated;
GRANT ALL ON public.game_entries TO service_role;
ALTER TABLE public.game_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or admin read entries" ON public.game_entries FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin delete entries" ON public.game_entries FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_game_rounds_updated_at BEFORE UPDATE ON public.game_rounds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();