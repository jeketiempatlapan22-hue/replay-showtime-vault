
ALTER TABLE public.replays
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS access_token text;

CREATE UNIQUE INDEX IF NOT EXISTS replays_access_token_unique
  ON public.replays (access_token)
  WHERE access_token IS NOT NULL;

INSERT INTO public.site_settings (key, value)
  VALUES ('live_chat_enabled', 'true')
  ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.prune_old_comments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.comments
  WHERE replay_id = NEW.replay_id
    AND id NOT IN (
      SELECT id FROM public.comments
      WHERE replay_id = NEW.replay_id
      ORDER BY created_at DESC
      LIMIT 30
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_prune_old ON public.comments;
CREATE TRIGGER comments_prune_old
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.prune_old_comments();
