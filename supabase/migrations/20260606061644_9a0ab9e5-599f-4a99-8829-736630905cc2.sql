ALTER TABLE public.active_show_tokens
  ADD COLUMN IF NOT EXISTS manual_resets_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_resets_max integer NOT NULL DEFAULT 3;