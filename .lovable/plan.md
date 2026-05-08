
# Plan: Player UX, HLS Optimization, Membership Tokens & Timezone

## 1. Auto-hide player controls (live + replay)

Apply to `HlsPlayer.tsx`, `EmbedPlayer.tsx`, `YouTubePlayer.tsx`:

- New state `controlsVisible` (default `true`) + ref `hideTimerRef`.
- On mouse-move / touch / pointer-move over player container → show controls + reset 3s timer.
- On click/tap on the video surface (not on a control button) → toggle visibility instantly (and reset timer when shown).
- When paused → keep controls visible (cancel timer).
- Controls wrapper gets `opacity-100 transition-opacity duration-300` when visible, `opacity-0 pointer-events-none` when hidden.
- Cursor: `cursor-none` on container when hidden.
- Buttons keep `stopPropagation` so clicks don't toggle visibility.

## 2. Fix play/pause + control buttons reliability

Root cause check: in `HlsPlayer` and `EmbedPlayer` overlay elements may be intercepting clicks. Fixes:

- Ensure controls container has `pointer-events-auto` and watermark/overlays use `pointer-events-none`.
- `<button onClick={(e) => { e.stopPropagation(); togglePlay(); }}>` for play/pause, mute, quality, fullscreen, seek.
- Replace `video.play()` with safe wrapper that catches `AbortError` to avoid the "play() interrupted" loop that freezes the button.
- For `EmbedPlayer` (iframe), keep an invisible click-shield only when controls are hidden so single-tap shows them; double-tap or button click works.

## 3. Live chat scroll & realtime

In `LiveChat.tsx`:

- Container: `flex flex-col h-full min-h-0`; messages list: `flex-1 min-h-0 overflow-y-auto overscroll-contain`.
- Auto-scroll to bottom when new message arrives **only if** user is already near bottom (preserve scroll if user scrolled up to read).
- Realtime subscription: single channel `live-messages-{showId}`, `postgres_changes` event `INSERT` on `live_messages`, dedupe by `id` in local state, unsubscribe on unmount.
- Wrap subscribe in try/catch + reconnect on `CHANNEL_ERROR` / `TIMED_OUT`.

## 4. HLS player optimization (m3u8)

In `HlsPlayer.tsx`:

- Initialize Hls.js with tuned config:
  - `enableWorker: true`, `lowLatencyMode: false`
  - `maxBufferLength: 30`, `maxMaxBufferLength: 60`, `backBufferLength: 30`
  - `abrEwmaDefaultEstimate: 500_000` (start ~0.5 Mbps so weak networks pick low rendition)
  - `startLevel: -1` (auto), `capLevelToPlayerSize: true`
  - `fragLoadingMaxRetry: 6`, `manifestLoadingMaxRetry: 4`
- On `MANIFEST_PARSED`: `hls.currentLevel = -1` (Auto by default).
- Network-aware floor: read `navigator.connection.effectiveType`; if `2g`/`slow-2g`/`3g` or `downlink < 1.5`, set `hls.autoLevelCapping` to the index of the lowest rendition ≤ 360p (fallback 270p) so ABR won't climb beyond that until network improves.
- Quality menu writes `hls.currentLevel = N` for manual selection AND sets a ref `userLockedLevel = N`. While locked, do NOT call any code that flips it back to auto. "Auto" item clears the lock and sets `currentLevel = -1`.
- Recovery: on `Hls.Events.ERROR` fatal `mediaError` → `hls.recoverMediaError()`, on `networkError` → `hls.startLoad()`. Non-fatal: ignore (prevents visible jumps).
- Keep `video.preload = "auto"`, remove any code that re-creates Hls instance on resize/visibility change.

## 5. Membership tokens (admin + WhatsApp bot)

### 5a. Schema (migration)

New tables:

- `membership_tokens`
  - `id uuid pk`, `token text unique`, `password text` (separate membership password — hashed-equivalent stored as plain like existing pattern), `label text`, `phone text`, `duration_days int`, `starts_at timestamptz default now()`, `expires_at timestamptz`, `revoked bool default false`, `manual_resets_used int default 0`, `manual_resets_max int default 3`, `created_at`, `created_by text` (`admin`/`bot`).
- `membership_token_devices`
  - `id`, `token_id uuid → membership_tokens(id) on delete cascade`, `browser_id text`, `created_at` (also stores `last_seen`).
- Optional: include replay scope flag `includes_replays bool default true` (we agreed: covers active shows + all replays + master monthly).

RLS: admin-only manage; public access through edge function only.

### 5b. Edge functions

New `manage-membership` (admin): create / list / revoke / extend / reset-devices.

Modify `unlock-live`:
1. After existing checks, if request includes `membership_token` + `membership_password`, validate against `membership_tokens` (not revoked, `expires_at > now()`).
2. Bind `browser_id` to `membership_token_devices` — allow only 1 active device row per token. If a different `browser_id` arrives, return `device_conflict` with `manual_resets_remaining`.
3. On success → bypass show password.

Modify `verify-password` (replay) similarly: accept membership token+password as a valid bypass.

New `membership-self-reset`:
- Body: `{ token, password, browser_id }`.
- Verify creds; if `manual_resets_used < manual_resets_max`, delete current device row, increment `manual_resets_used`, return remaining.
- Else `quota_exhausted`.

### 5c. WhatsApp bot command

Extend `fonnte-webhook` to handle `/membership <bulan>` (sender must be in `bot_admins`):
- Parse months, generate token + password (random), `expires_at = now() + bulan*30 days`.
- Insert `membership_tokens` row with `created_by='bot'` and `phone = sender` (or target phone if `/membership <bulan> <phone>` form).
- Send reply via Fonnte: link `${ORIGIN}/live?mtoken=<token>` + password + expiry + 3 reset quota note.

### 5d. Daily 00:00 WIB auto-reset

- Enable `pg_cron` + `pg_net` (if not already).
- Schedule `0 17 * * *` UTC (= 00:00 WIB / UTC+7) calling new edge function `membership-daily-reset` which:
  - `DELETE FROM membership_token_devices` (all rows).
  - `UPDATE membership_tokens SET manual_resets_used = 0 WHERE revoked = false AND expires_at > now();`
- Insert SQL for `cron.schedule` via insert tool (contains project URL/anon key).

### 5e. Admin UI (in `src/pages/Admin.tsx`)

New tab "Membership":
- Form: label, phone (optional), duration (months), generate button → calls `manage-membership`.
- Table: token (copy), password (copy), link, phone, expires_at (in user TZ), devices count, manual_resets_used/max, revoke button, reset-devices button.
- Show "membership link" preview that the user can share.

### 5f. Frontend integration

- `Live.tsx` & replay unlock dialog: accept query `?mtoken=<token>` → auto-fill membership flow + prompt for membership password (separate from show password). Persist in `localStorage` as `membership-token` and `membership-pass` so user doesn't re-enter.
- New small "Reset device" button on the unlock screen when error = `device_conflict`, calls `membership-self-reset`.

## 6. Multi-timezone time display

- New util `src/lib/time.ts`:
  - `formatLocalDateTime(iso, opts?)` using `Intl.DateTimeFormat(undefined, { dateStyle, timeStyle, timeZoneName: 'short' })`.
  - `formatLocalCountdown(target)` returns `Xh Ym Zs` based on `target - Date.now()` (TZ-agnostic).
  - `formatShowDateTime(show_date, show_time)` — combine date + time as Asia/Jakarta wall clock then convert to user TZ via `new Date(`${date}T${time}+07:00`)`.
- Replace direct `toLocaleString()` / hand-rolled formatters in `ActiveShowCard`, `ActiveShowsSection`, `Live.tsx` schedule/countdown, replay card date display.
- All countdowns use `Date.now()` vs absolute timestamp, so user's own clock + TZ are honored automatically.

## Technical notes

- `browser_id` already exists in `localStorage` (used by ratings & live_token_devices) — reuse same key.
- Membership password stays plain text to match existing `replays.password` / `active_shows.live_password` pattern; verification only via edge function (never exposed to client query).
- Cron schedule string (UTC): `0 17 * * *`.
- All new edge functions: `verify_jwt = false` (default), CORS headers, Zod-validated bodies.

## Verification

- Build passes; test login flows.
- Manual: open `/live?show=...`, verify controls auto-hide after 3s, click toggles, play/pause works, chat scrolls.
- Throttle network to Slow 3G in DevTools → confirm 270p/360p auto-selected; manually pick 720p → confirm it stays locked.
- Generate a membership token in Admin, open in incognito → unlock works; open in second browser → `device_conflict` + reset button works (decrements quota); after 3 resets → `quota_exhausted`.
- Trigger `membership-daily-reset` manually via curl_edge_functions → device rows cleared, quota reset.
- Send `/membership 1` from a `bot_admins` phone → WA reply with link + password.
