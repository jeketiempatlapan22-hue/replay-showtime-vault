ALTER TABLE public.game_entries ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.game_entries ADD COLUMN browser_id text;
CREATE UNIQUE INDEX game_entries_round_browser_uniq ON public.game_entries(round_id, browser_id) WHERE browser_id IS NOT NULL;
ALTER TABLE public.game_rounds ADD COLUMN images_cleaned boolean NOT NULL DEFAULT false;