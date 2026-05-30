ALTER TABLE public.active_shows
  ADD COLUMN IF NOT EXISTS group_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS replay_info text NOT NULL DEFAULT '';