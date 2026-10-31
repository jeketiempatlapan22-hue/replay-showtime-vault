# Project Architecture Rules

- Group related admin tools through internal section selectors while retaining their existing components, so menu consolidation does not duplicate business logic.
- Use native controls for YouTube in the shared embed player and keep site-specific TV pairing outside the video, so replay, live, and TV share unobstructed interactions.
- Rewrite only "Link Replay" blocks to site_settings.replay_origin via _shared/replay-origin.ts at send/return points, so live links stay on the primary domain while the secret replay domain can change without code edits.
