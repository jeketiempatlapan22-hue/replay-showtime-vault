-- replays
REVOKE SELECT ON public.replays FROM anon, authenticated;
GRANT SELECT (id, title, date, criteria, lineup, image_url, created_at, updated_at, show_name, featured_member, view_count, show_time, source_type, admin_alias, price_coins, is_offline, offline_reason, offline_at, price_idr, image_fit) ON public.replays TO anon, authenticated;

-- active_shows
REVOKE SELECT ON public.active_shows FROM anon, authenticated;
GRANT SELECT (id, title, show_date, show_time, lineup, category, description, image_url, sort_order, is_active, created_at, updated_at, price_show, price_replay, pakasir_amount, replay_id, replay_enabled, is_live, live_auto_schedule, live_type, live_require_password, replay_mode, admin_alias, price_show_coins, price_replay_coins, idn_show_id, group_link, is_special, group_link_enabled, group_link_label, group_link_note, live_hold_until) ON public.active_shows TO anon, authenticated;

-- membership_packages
REVOKE SELECT ON public.membership_packages FROM anon, authenticated;
GRANT SELECT (id, name, description, duration_days, price_idr, price_coins, pakasir_amount, quota_total, quota_reserved, max_devices, includes_replays, status, sort_order, created_at, updated_at, paused, pause_message, fixed_starts_at, fixed_expires_at) ON public.membership_packages TO anon, authenticated;