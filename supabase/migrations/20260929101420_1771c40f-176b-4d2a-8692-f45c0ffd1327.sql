CREATE TABLE public.game_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  ident text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  answer text,
  UNIQUE (question_id, ident)
);
GRANT ALL ON public.game_views TO service_role;
ALTER TABLE public.game_views ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.game_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  round_title text NOT NULL DEFAULT '',
  kind text NOT NULL,
  show_id uuid REFERENCES public.active_shows(id) ON DELETE CASCADE,
  bundle_id uuid REFERENCES public.show_bundles(id) ON DELETE CASCADE,
  prize jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.game_wins(user_id, created_at DESC);
GRANT SELECT ON public.game_wins TO authenticated;
GRANT ALL ON public.game_wins TO service_role;
ALTER TABLE public.game_wins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own game wins" ON public.game_wins FOR SELECT TO authenticated USING (auth.uid() = user_id);