---
name: Video Source Protection
description: youtube_id and m3u8_url are never exposed in public replay queries — only via the get-replay-source edge function after password verification
type: feature
---
- Public `getReplays()` in `src/lib/store.ts` selects a whitelist of columns; `youtube_id`, `m3u8_url`, and `password` are excluded.
- `getReplaySource(replay_id, password)` calls the `get-replay-source` edge function which verifies the sandi (per-replay or master) server-side and returns source data only when valid.
- `ReplayCardComponent` stores the verified password in `sessionStorage` under key `replaytime-pw-<replayId>`. `YouTubePlayer` reads this on mount to fetch source.
- YouTube iframe `src` is set via JS after mount (not in initial HTML) so the ID does not appear in static "View Source".
- HLS uses MediaSource Extensions, so `<video>` element automatically gets a `blob:` src — manifest URL only lives in hls.js memory.
- Admin UI uses `getReplaysAdmin()` which selects all columns. Public components must never call it.
