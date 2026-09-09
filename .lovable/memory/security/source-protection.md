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

## Column-level lockdown (2026-09-09)
- `anon`/`authenticated` no longer hold table-wide SELECT on `replays`, `active_shows`, `membership_packages`; they only have column-level GRANTs for non-secret columns. `select('*')` on these tables now fails for the client.
- Locked columns: replays(password, youtube_id, m3u8_url, sources, access_token), active_shows(live_password, live_url, live_sources, replay_info), membership_packages(replay_info).
- Buyers still get passwords/URLs through server paths: `get-access-info`, `get-replay-source`, `unlock-live`, `get_my_memberships`. Admin paths use `admin_get_replays`, `admin_get_active_shows`, `admin_get_membership_packages`.
- If a new column holds a secret, add it to the REVOKE list and never to the public GRANT list.
