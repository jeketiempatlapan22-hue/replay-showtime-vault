REVOKE SELECT (password, youtube_id, m3u8_url, sources, access_token) ON public.replays FROM anon, authenticated;
REVOKE SELECT (live_password, live_url, live_sources, replay_info) ON public.active_shows FROM anon, authenticated;
REVOKE SELECT (replay_info) ON public.membership_packages FROM anon, authenticated;