CREATE UNIQUE INDEX IF NOT EXISTS live_token_devices_token_browser_uniq
  ON public.live_token_devices(token_id, browser_id);

ALTER TABLE public.live_tokens REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_tokens;