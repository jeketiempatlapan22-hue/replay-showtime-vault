-- Auto-prune live_messages: keep latest 30 non-pinned, preserve pinned indefinitely.
-- Function prune_old_live_messages already exists; attach trigger after INSERT.
DROP TRIGGER IF EXISTS trg_prune_live_messages ON public.live_messages;
CREATE TRIGGER trg_prune_live_messages
AFTER INSERT ON public.live_messages
FOR EACH ROW
EXECUTE FUNCTION public.prune_old_live_messages();

-- Helpful index for ordering
CREATE INDEX IF NOT EXISTS idx_live_messages_pinned_created
  ON public.live_messages (pinned, created_at DESC);