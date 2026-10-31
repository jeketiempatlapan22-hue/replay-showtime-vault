# Project Architecture Rules

- Group related admin tools through internal section selectors while retaining their existing components, so menu consolidation does not duplicate business logic.
- Use native controls for YouTube in the shared embed player and keep site-specific TV pairing outside the video, so replay, live, and TV share unobstructed interactions.
- Rewrite only "Link Replay" blocks to site_settings.replay_path (secret path on the primary domain, default "rply") via _shared/replay-origin.ts at send/return points, so live links stay on the primary domain root while the secret replay path can change without code edits.
