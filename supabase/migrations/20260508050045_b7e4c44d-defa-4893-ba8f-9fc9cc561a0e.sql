ALTER TABLE public.active_shows
  ADD COLUMN IF NOT EXISTS price_show integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_replay integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pakasir_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replay_id uuid NULL,
  ADD COLUMN IF NOT EXISTS replay_enabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_active_shows_replay_id ON public.active_shows(replay_id);