# Memory: index.md
Updated: now

## ReplayTime project preferences

- Admin panel route: `/adpan`
- Admin auth: Supabase email/password login (email: dhy@01.com, password: dhatul01)
- Database: Lovable Cloud (Supabase) — tables: `replays`, `master_passwords`, `site_settings`, `ratings`, `comments`, `user_roles`
- Storage bucket: `card-images` for uploaded card photos with gallery reuse
- Theme system: selectable from admin (ramadhan, space, ocean, sunset, forest, sunrise, winter, spring, aurora) — realtime sync
- RLS: public read, admin-only write (via has_role function + user_roles table)
- Fonts: Amiri (headings), Poppins (body)
- Language: Indonesian (Bahasa Indonesia)
- Hamburger menu links to realstream48.lovable.app + WhatsApp info from admin settings
- Image upload: admin uploads photos directly, stored in Supabase storage with gallery picker
- Features: rating stars, comments (realtime), view count, bookmarks, search highlight, scroll-to-top, PWA, dark/light mode
- Signup disabled, auto-confirm enabled
