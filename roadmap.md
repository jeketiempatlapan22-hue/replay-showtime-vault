# Roadmap

- [x] Apply Website B chat document: server-side send, role banners, moderation actions, sender details; 8 tests and desktop/mobile dialog checks passed (no backend or admin-panel copies).
- [ ] Verify real admin/moderator chat actions end-to-end on Website A's shared backend; no authenticated shared-backend session is available here. Endpoint existence and anonymous denial verified.

- [x] Complete document audit, Server 3 DVR/replay selection, and bulk Server 3 import with tests.
- [ ] Verify deployed Website A SForge columns/privacy, sync secret and replay conversion; blocked by Website A backend access from this project.
- [ ] Verify real paid-token live/replay playback; requires a valid Website A test token and active SForge show.

- [x] Repair live/admin link copying and complete token replay messages.
- [x] Show the birthday/graduating member on active-show cards.
- [x] Verify the affected flows and tests.

- [x] Add TV/projector connection controls to replay players, matching live behavior.
- [x] Standardize non-admin live-chat username and comment colors.
- [x] Improve pinned-message prominence without obscuring chat.
- [x] Increase live-chat column height and verify mobile/desktop.
- [x] Make replay six-digit TV pairing and Chromecast reliable across Android, iPhone, and desktop.
- [x] Remove the transparent replay YouTube cover while retaining visible player controls.
- [x] Combine related admin menus and place link creation below Live Monitor.
- [x] Rename the main navigation item from Home to Replay with a matching icon.

- [x] Menu button "Reset Semua Perangkat" with 3x/day quota (resets 00:00 WIB).
- [x] Accept Website A password handoff (?pw=) on Website B live and replay.
- [ ] Midnight auto-reset of all device bindings + daily quota for show tokens; must be built in Website A's backend.

- [x] Bulk device reset falls back to per-token reset (membership/show) while Website A's bulk function rejects unconditional DELETE.
- [x] Keep the admin live monitor iframe on the admin domain so admin badge/sender info work.
- [x] Password users resolve the live show and refresh their short grant; replay retries uppercase password.
- [ ] Website A: add WHERE to admin_bulk_reset_devices, return show_id for password unlock, normalize replay password compare (see Perintah_Website_A_v3.txt).
