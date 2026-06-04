-- active_shows: stream URL + password + alt-stream list must never leak to client
REVOKE SELECT (live_password, live_url, live_sources, replay_m3u8_url, replay_youtube_url)
  ON public.active_shows FROM anon, authenticated;

-- replays: per-replay stream URL, sources list, master password, plaintext access token
REVOKE SELECT (password, m3u8_url, sources, access_token)
  ON public.replays FROM anon, authenticated;

-- membership_packages: replay_info contains plaintext replay URL+password
REVOKE SELECT (replay_info)
  ON public.membership_packages FROM anon, authenticated;