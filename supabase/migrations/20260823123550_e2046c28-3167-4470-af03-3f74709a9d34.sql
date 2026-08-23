ALTER TABLE public.active_shows
  ADD COLUMN IF NOT EXISTS group_link_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_link_label text NOT NULL DEFAULT 'Join Saluran',
  ADD COLUMN IF NOT EXISTS group_link_note text NOT NULL DEFAULT '';