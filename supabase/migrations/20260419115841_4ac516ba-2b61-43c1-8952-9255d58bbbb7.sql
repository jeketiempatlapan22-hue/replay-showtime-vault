-- Add M3U8 support to replays
ALTER TABLE public.replays
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS m3u8_url TEXT NOT NULL DEFAULT '';

-- Allow youtube_id to be empty when source is m3u8
ALTER TABLE public.replays ALTER COLUMN youtube_id SET DEFAULT '';

-- Blocked browsers table
CREATE TABLE IF NOT EXISTS public.blocked_browsers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT 'devtools_detected',
  unblocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_browsers ENABLE ROW LEVEL SECURITY;

-- Anyone (anon) can insert their own block record
CREATE POLICY "Anyone can insert block records"
  ON public.blocked_browsers FOR INSERT
  WITH CHECK (true);

-- Anyone can read to check their own status
CREATE POLICY "Anyone can read block status"
  ON public.blocked_browsers FOR SELECT
  USING (true);

-- Only admins can update (unblock)
CREATE POLICY "Admins can update blocks"
  ON public.blocked_browsers FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete
CREATE POLICY "Admins can delete blocks"
  ON public.blocked_browsers FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to update timestamp
CREATE OR REPLACE FUNCTION public.update_blocked_browsers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_blocked_browsers_updated ON public.blocked_browsers;
CREATE TRIGGER trg_blocked_browsers_updated
  BEFORE UPDATE ON public.blocked_browsers
  FOR EACH ROW EXECUTE FUNCTION public.update_blocked_browsers_timestamp();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_browsers;