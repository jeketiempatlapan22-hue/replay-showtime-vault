# Project Architecture Rules

- Store the special-show member in active_shows.featured_member and retrieve it through the existing public column allowlist, so card metadata never requires exposing stream credentials.
- Use the shared clipboard helper for access-link tools and keep complete text selectable when copying is unavailable, so browser permission failures cannot silently lose tokens.

- Group related admin tools through internal section selectors while retaining their existing components, so menu consolidation does not duplicate business logic.
- Use native controls for YouTube in the shared embed player and keep site-specific TV pairing outside the video, so replay, live, and TV share unobstructed interactions.
- Rewrite only "Link Replay" blocks to site_settings.replay_path (secret path on the primary domain, default "rply") via _shared/replay-origin.ts at send/return points, so live links stay on the primary domain root while the secret replay path can change without code edits.
- Route pages across sites via DomainRouter using site_settings main_origin/live_origin/replay_origin (admin & reseller never redirected), and swap message domains via link_origin in _shared/replay-origin.ts, so twin sites sharing one backend can trade roles without reissuing links.
- Website B (this remix) imports the client from src/integrations/backend.ts pointing at Website A's backend and never deploys supabase/functions, so tokens, payments and stream keys stay shared with Website A.
- Keep DVR buffer/jump policy and replay source selection in the shared playback policy module, so live controls and replay fallback use testable rules without altering access validation.
- Website B reads/writes its own maintenance keys (src/lib/siteKeys.ts) in the shared site_settings, so toggling maintenance on one site never closes the other.
