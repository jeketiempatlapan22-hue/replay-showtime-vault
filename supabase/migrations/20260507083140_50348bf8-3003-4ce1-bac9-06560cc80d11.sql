CREATE INDEX IF NOT EXISTS idx_comments_replay_created_at_desc
ON public.comments (replay_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_replay_id_id
ON public.comments (replay_id, id);

CREATE INDEX IF NOT EXISTS idx_replays_access_token_lookup
ON public.replays (access_token)
WHERE access_token IS NOT NULL;

DROP TRIGGER IF EXISTS comments_prune_old ON public.comments;
CREATE TRIGGER comments_prune_old
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.prune_old_comments();