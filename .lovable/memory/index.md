# Memory: index.md
Updated: just now

# Project Memory

## Core
- Platform: ReplayTime (RealTime48) - YouTube replay platform grouped by month.
- Security: Dual passwords (card + master) verified strictly server-side via Supabase Edge Functions. Never expose `password` column.
- Source protection: `youtube_id` & `m3u8_url` NEVER returned in public `getReplays()` — only via `get-replay-source` edge function after sandi verified. Admin uses `getReplaysAdmin()`.
- DOM Stability: Keep replay list and player permanently in DOM using CSS visibility to prevent transition crashes.
- Video Player: Use `youtube-nocookie.com`, `playsinline`, `iv_load_policy=3`. Iframe src set via JS after mount. Forbid "Watch on YouTube" button.
- State: Persist `unlockedIds` & playing state in `sessionStorage`. Sandi per replay disimpan di `sessionStorage` key `replaytime-pw-<id>`. Use `browser_id` in `localStorage` for guest ratings.
- Admin: Access at `/adpan` (dhy@01.com). Label admin comments with "🛡️ Admin".
- Sorting: Order by `date` + `show_time` (newest first). Hide `show_time` from user UI.

## Memories
- [Platform Overview](mem://project/overview) — Core platform purpose, branding, and content grouping
- [Admin Access & Moderation](mem://auth/admin-access) — Admin panel routing, auth, layout, and comment moderation logic
- [Password Verification Logic](mem://security/password-logic) — Server-side password verification using Supabase Edge Functions
- [Video Source Protection](mem://security/source-protection) — youtube_id/m3u8_url hidden until sandi verified, fetched via edge function
- [Theme System](mem://style/theme-system) — 9 animated themes with custom light/dark modes
- [Supabase Schema & Storage](mem://database/schema-storage) — Core tables, specific replay columns, RPCs, and storage buckets
- [Core Functionality](mem://features/core-functionality) — Realtime sync, card hover effects, and PWA capabilities
- [Navigation & Layout](mem://style/navigation-layout) — Hamburger menu links, logo placement, and dark/light toggle
- [Video Player Constraints](mem://features/video-player) — YouTube player URL parameters and interaction constraints
- [Sorting Logic](mem://features/sorting-logic) — Reverse chronological sorting combining date and show_time
- [Stability & State Handling](mem://features/stability-handling) — Error boundaries, DOM preservation, and sessionStorage usage
- [Animations & Transitions](mem://style/animations-transitions) — Timing for theme changes and player open/close animations
- [Engagement & Rating Logic](mem://features/engagement-logic) — Guest-friendly rating system using localStorage
